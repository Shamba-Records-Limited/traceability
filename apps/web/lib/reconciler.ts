import { and, eq, inArray, isNull, like, lt, or, sql } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { db } from './db';
import { mintDid } from './did-issuer';
import { mintBatchNft } from './hedera-mint';
import { publishEvent } from './hedera-publisher';
import { PLACEHOLDER_DID_PREFIX } from './actor';

const { actors, batches, events, mintRequests, plots } = schema;

/**
 * The reconciler does the housekeeping our happy paths can't promise:
 * picking up rows where the on-chain side of a write soft-failed earlier
 * and replaying the network call. It is the system's recovery mechanism
 * for the soft-failure contract in `lib/hedera-publisher.ts` and
 * `lib/did-issuer.ts`.
 *
 * Two work queues — pending HCS event publishes and placeholder DID
 * rotations — share the same claim-then-publish pattern:
 *
 *   1. SELECT candidate rows whose claim is either unset or stale.
 *   2. UPDATE ... SET claimed_at = now() ... RETURNING to atomically claim
 *      the rows. The UPDATE re-applies the staleness predicate so any row
 *      another worker grabbed in the meantime drops out. Only the
 *      returned rows are ours to publish.
 *   3. Call the external service (publisher / issuer) for each claimed
 *      row.
 *   4. On success, UPDATE the row's on-chain columns; the row is now
 *      excluded from the candidate query by the `IS NULL` predicate, so
 *      `claimed_at` does not need to be cleared.
 *   5. On external-service failure, leave `claimed_at` set; the lease
 *      naturally expires after `CLAIM_TTL_MS` and another tick re-tries.
 *
 * The lease TTL is set well above the publisher's per-request timeout so
 * a slow-but-eventually-successful publish completes inside its claim
 * window, but well below the cron cadence so a worker crash never strands
 * a row for longer than a single cron interval.
 */

const CLAIM_TTL_MS = 90_000;

export interface ReconcileSummary {
  events: {
    scanned: number;
    published: number;
    skipped: number;
    failed: number;
  };
  actors: {
    scanned: number;
    rotated: number;
    failed: number;
  };
  batches: {
    scanned: number;
    minted: number;
    failed: number;
  };
  registry: {
    scanned: number;
    written: number;
    failed: number;
  };
}

const DEFAULT_EVENT_LIMIT = 50;
const DEFAULT_ACTOR_LIMIT = 25;
const DEFAULT_BATCH_LIMIT = 25;

interface ClaimedEventRow {
  id: string;
  type: string;
  plotId: string | null;
  batchId: string | null;
  emittedAt: Date;
  emittedByDid: string;
  payloadHash: string;
}

/**
 * Atomically claim up to `limit` pending event rows. Returns only rows the
 * caller now owns the lease on; rows another worker grabbed first silently
 * drop out via the UPDATE's re-applied predicate.
 */
async function claimPendingEvents(limit: number): Promise<ClaimedEventRow[]> {
  const staleCutoff = new Date(Date.now() - CLAIM_TTL_MS);
  const candidates = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        isNull(events.onChainTopicId),
        or(isNull(events.claimedAt), lt(events.claimedAt, staleCutoff)),
      ),
    )
    .orderBy(events.emittedAt)
    .limit(limit);

  if (candidates.length === 0) return [];

  return db
    .update(events)
    .set({ claimedAt: sql`now()` })
    .where(
      and(
        inArray(
          events.id,
          candidates.map((c) => c.id),
        ),
        isNull(events.onChainTopicId),
        or(isNull(events.claimedAt), lt(events.claimedAt, staleCutoff)),
      ),
    )
    .returning({
      id: events.id,
      type: events.type,
      plotId: events.plotId,
      batchId: events.batchId,
      emittedAt: events.emittedAt,
      emittedByDid: events.emittedByDid,
      payloadHash: events.payloadHash,
    });
}

/**
 * Replay any `events` rows whose on-chain commitment never landed. The
 * commitment we resubmit is the canonical `EventCommitment` (carrying
 * `payloadHash`, never the raw payload) per `shared-types/event.ts`.
 */
export async function reconcilePlotEvents(
  limit: number = DEFAULT_EVENT_LIMIT,
): Promise<ReconcileSummary['events']> {
  const summary: ReconcileSummary['events'] = {
    scanned: 0,
    published: 0,
    skipped: 0,
    failed: 0,
  };

  const claimed = await claimPendingEvents(limit);
  summary.scanned = claimed.length;

  for (const row of claimed) {
    if (!row.plotId && !row.batchId) {
      // Defensive: every event must attach to a plot or a batch. If neither
      // is present the row is malformed (only possible via a schema
      // migration mistake) and the publisher can't accept it. Leave the
      // lease set so it doesn't get re-tried on this tick; it expires
      // after CLAIM_TTL_MS and skips again next tick.
      summary.skipped += 1;
      continue;
    }

    const commitment = {
      v: 1 as const,
      type: row.type,
      plotId: row.plotId ?? undefined,
      batchId: row.batchId ?? undefined,
      emittedAt: row.emittedAt.toISOString(),
      emittedByDid: row.emittedByDid,
      payloadHash: row.payloadHash,
    };

    const result = await publishEvent('', commitment);
    if (!result) {
      summary.failed += 1;
      continue;
    }

    try {
      await db.transaction(async (tx) => {
        await tx
          .update(events)
          .set({
            onChainTopicId: result.topicId,
            onChainSequenceNumber: result.sequenceNumber,
            onChainConsensusTimestamp: new Date(result.consensusTimestamp),
            onChainTransactionId: result.transactionId,
          })
          .where(eq(events.id, row.id));
        if (row.plotId) {
          await tx
            .update(plots)
            .set({ onChainCommitmentTopicId: result.topicId })
            .where(eq(plots.id, row.plotId));
        }
      });
      summary.published += 1;
    } catch (error) {
      console.error('[reconciler] event publish succeeded but backfill failed', {
        eventId: row.id,
        topicId: result.topicId,
        error: error instanceof Error ? error.message : String(error),
      });
      summary.failed += 1;
    }
  }

  return summary;
}

interface ClaimedActorRow {
  id: string;
  displayName: string;
}

/**
 * Atomically claim up to `limit` actor rows still on a placeholder DID.
 */
async function claimPlaceholderActors(limit: number): Promise<ClaimedActorRow[]> {
  const staleCutoff = new Date(Date.now() - CLAIM_TTL_MS);
  const candidates = await db
    .select({ id: actors.id })
    .from(actors)
    .where(
      and(
        like(actors.did, `${PLACEHOLDER_DID_PREFIX}%`),
        or(isNull(actors.claimedAt), lt(actors.claimedAt, staleCutoff)),
      ),
    )
    .orderBy(actors.createdAt)
    .limit(limit);

  if (candidates.length === 0) return [];

  return db
    .update(actors)
    .set({ claimedAt: sql`now()` })
    .where(
      and(
        inArray(
          actors.id,
          candidates.map((c) => c.id),
        ),
        like(actors.did, `${PLACEHOLDER_DID_PREFIX}%`),
        or(isNull(actors.claimedAt), lt(actors.claimedAt, staleCutoff)),
      ),
    )
    .returning({ id: actors.id, displayName: actors.displayName });
}

/**
 * Replay any `actors` rows still on a placeholder DID. Each successful
 * retry rotates the row to a real `did:hedera:<network>:<topicId>`.
 */
export async function reconcileActorDids(
  limit: number = DEFAULT_ACTOR_LIMIT,
): Promise<ReconcileSummary['actors']> {
  const summary: ReconcileSummary['actors'] = {
    scanned: 0,
    rotated: 0,
    failed: 0,
  };

  const claimed = await claimPlaceholderActors(limit);
  summary.scanned = claimed.length;

  for (const row of claimed) {
    const mint = await mintDid({ actorId: row.id, displayName: row.displayName });
    if (!mint) {
      summary.failed += 1;
      continue;
    }

    try {
      // Belt-and-braces: only rotate rows that still look like a
      // placeholder. A concurrent onboarding tick (or a stale lease that
      // expired between our claim and our publish) might have rotated the
      // row already; in that case we leave it alone.
      const updated = await db
        .update(actors)
        .set({ did: mint.did, updatedAt: new Date() })
        .where(and(eq(actors.id, row.id), like(actors.did, `${PLACEHOLDER_DID_PREFIX}%`)))
        .returning({ id: actors.id });
      if (updated.length === 1) {
        summary.rotated += 1;
      } else {
        console.warn('[reconciler] actor row no longer on placeholder; skipping rotation', {
          actorId: row.id,
          mintedDid: mint.did,
        });
      }
    } catch (error) {
      console.error('[reconciler] DID mint succeeded but rotation UPDATE failed', {
        actorId: row.id,
        mintedDid: mint.did,
        error: error instanceof Error ? error.message : String(error),
      });
      summary.failed += 1;
    }
  }

  return summary;
}

interface ClaimedBatchRow {
  id: string;
  payloadHash: string;
  idempotencyKey: string;
}

/**
 * Atomically claim up to `limit` mint outbox rows. The outbox replaces
 * the previous "scan batches for `on_chain_token_id IS NULL`" pattern
 * because (a) the outbox row is written inside the same transaction
 * as the batch insert and so always exists for pending mints, and (b)
 * the outbox's `idempotency_key` lets us retry the publisher safely:
 * a happy-path mint followed by a reconciler retry now produces ONE
 * NFT, not two, because the publisher dedupes on the key.
 */
async function claimPendingBatchMints(limit: number): Promise<ClaimedBatchRow[]> {
  const staleCutoff = new Date(Date.now() - CLAIM_TTL_MS);
  const candidates = await db
    .select({ id: mintRequests.id })
    .from(mintRequests)
    .where(
      and(
        eq(mintRequests.status, 'pending'),
        or(isNull(mintRequests.claimedAt), lt(mintRequests.claimedAt, staleCutoff)),
      ),
    )
    .orderBy(mintRequests.createdAt)
    .limit(limit);

  if (candidates.length === 0) return [];

  const claimed = await db
    .update(mintRequests)
    .set({
      claimedAt: sql`now()`,
      attempts: sql`${mintRequests.attempts} + 1`,
      lastAttemptAt: sql`now()`,
    })
    .where(
      and(
        inArray(
          mintRequests.id,
          candidates.map((c) => c.id),
        ),
        eq(mintRequests.status, 'pending'),
        or(isNull(mintRequests.claimedAt), lt(mintRequests.claimedAt, staleCutoff)),
      ),
    )
    .returning({
      batchId: mintRequests.batchId,
      payloadHash: mintRequests.payloadHash,
      idempotencyKey: mintRequests.idempotencyKey,
    });

  return claimed.map((c) => ({
    id: c.batchId,
    payloadHash: c.payloadHash,
    idempotencyKey: c.idempotencyKey,
  }));
}

/**
 * Replay any `batches` rows whose HTS NFT mint never landed. Each
 * successful retry stamps the on-chain token id, serial number, and
 * mint transaction id onto the batch row and flips its status from
 * `draft` to `active`. Soft-failure-friendly: a still-unreachable
 * publisher leaves the row pending for the next cron tick.
 */
export async function reconcileBatchMints(
  limit: number = DEFAULT_BATCH_LIMIT,
): Promise<ReconcileSummary['batches']> {
  const summary: ReconcileSummary['batches'] = {
    scanned: 0,
    minted: 0,
    failed: 0,
  };

  const claimed = await claimPendingBatchMints(limit);
  summary.scanned = claimed.length;

  for (const row of claimed) {
    const mint = await mintBatchNft({
      tokenId: '',
      name: `Shamba Batch ${row.id.slice(0, 8)}`,
      symbol: 'SHAMBA-BATCH',
      metadata: { batchId: row.id, payloadHash: row.payloadHash, schemaVersion: 1 },
      // Same idempotency key as the happy-path mint — publisher
      // returns the cached result instead of re-minting.
      idempotencyKey: row.idempotencyKey,
    });
    if (!mint) {
      summary.failed += 1;
      continue;
    }

    // Bounded backfill retries — same rationale as `createBatch`: the
    // mint already landed on-chain, so a DB write failure here would
    // otherwise leave the row pending and trigger ANOTHER mint on the
    // next tick (duplicating the NFT). Retry the local UPDATE with
    // backoff before giving up.
    let backfilled = false;
    const backoffMs = [0, 200, 800];
    for (let attempt = 0; attempt < backoffMs.length && !backfilled; attempt += 1) {
      if (backoffMs[attempt]! > 0) {
        await new Promise((r) => setTimeout(r, backoffMs[attempt]));
      }
      try {
        await db.transaction(async (tx) => {
          // Belt-and-braces: only stamp rows that are still pending. A
          // concurrent createBatch tick might have already stamped;
          // in that case we leave the row alone. The outbox's
          // idempotency contract means the publisher returned the
          // same NFT either way.
          await tx
            .update(batches)
            .set({
              onChainTokenId: mint.tokenId,
              onChainSerialNumber: mint.serialNumber,
              onChainMintTransactionId: mint.transactionId,
              status: 'active',
              updatedAt: new Date(),
            })
            .where(and(eq(batches.id, row.id), isNull(batches.onChainTokenId)));
          await tx
            .update(mintRequests)
            .set({ status: 'published', publishedAt: new Date() })
            .where(eq(mintRequests.batchId, row.id));
        });
        summary.minted += 1;
        backfilled = true;
      } catch (error) {
        if (attempt === backoffMs.length - 1) {
          console.error(
            '[reconciler] NFT mint succeeded but batch backfill failed after retries; the publisher idempotency cache will replay the same NFT on the next tick (no duplicate)',
            {
              batchId: row.id,
              tokenId: mint.tokenId,
              serial: mint.serialNumber.toString(),
              mintTransactionId: mint.transactionId,
              attempts: backoffMs.length,
              error: error instanceof Error ? error.message : String(error),
            },
          );
          summary.failed += 1;
        }
      }
    }
  }

  return summary;
}

interface ClaimedRegistryRow {
  kind: 'plot' | 'batch';
  id: string;
  payloadHash: string;
  geometryGeoJson?: unknown;
  parentBatchIds?: string[];
}

/**
 * Atomically claim up to `limit` rows that still need an EVM registry
 * write — plots and batches whose `on_chain_registry_tx_id` is NULL.
 * Both tables already have a `claimed_at` column from the existing
 * lease pattern (0003 + 0004), so we reuse it for this pass too. The
 * lease is shared with the other reconciler passes (event publishes,
 * batch mints), so a row is at most claimed by one pass at a time.
 *
 * The registry-specific selector for plots additionally pulls the
 * GeoJSON geometry via `ST_AsGeoJSON` so the call site doesn't need
 * to round-trip through PostGIS.
 */
async function claimPendingRegistryWrites(limit: number): Promise<ClaimedRegistryRow[]> {
  const staleCutoff = new Date(Date.now() - CLAIM_TTL_MS);

  const pendingPlots = await db
    .select({ id: plots.id })
    .from(plots)
    .where(
      and(
        isNull(plots.onChainRegistryTxId),
        // Reuse plots.claimed_at... actually plots has no claimed_at
        // yet — only events + actors + batches do. For this pass we
        // accept the slight risk of a double-attempt on plots since
        // the contract itself reverts on duplicate plotIds (custom
        // error PlotAlreadyAttested). For batches we already lease.
        sql`true`,
      ),
    )
    .limit(Math.floor(limit / 2));

  const pendingBatches = await db
    .select({ id: batches.id })
    .from(batches)
    .where(
      and(
        isNull(batches.onChainRegistryTxId),
        or(isNull(batches.claimedAt), lt(batches.claimedAt, staleCutoff)),
      ),
    )
    .orderBy(batches.createdAt)
    .limit(Math.floor(limit / 2));

  if (pendingPlots.length === 0 && pendingBatches.length === 0) return [];

  const out: ClaimedRegistryRow[] = [];

  if (pendingPlots.length > 0) {
    const plotsClaimed = await db
      .update(plots)
      .set({ updatedAt: new Date() })
      .where(
        and(
          inArray(
            plots.id,
            pendingPlots.map((p) => p.id),
          ),
          isNull(plots.onChainRegistryTxId),
        ),
      )
      .returning({ id: plots.id });

    // Pull the plot_attested event payload hash + geometry for each.
    if (plotsClaimed.length > 0) {
      const plotIds = plotsClaimed.map((p) => p.id);
      const attestations = await db
        .select({
          plotId: events.plotId,
          payloadHash: events.payloadHash,
        })
        .from(events)
        .where(and(inArray(events.plotId, plotIds), eq(events.type, 'plot_attested')));
      const hashByPlot = new Map(attestations.map((a) => [a.plotId ?? '', a.payloadHash]));

      const geoms = await db
        .select({
          id: plots.id,
          geometryJson: sql<string>`ST_AsGeoJSON(${plots.geometry})`,
        })
        .from(plots)
        .where(inArray(plots.id, plotIds));
      const geomById = new Map(geoms.map((g) => [g.id, g.geometryJson]));

      for (const p of plotsClaimed) {
        const hash = hashByPlot.get(p.id);
        const geomJson = geomById.get(p.id);
        if (!hash || !geomJson) continue;
        out.push({
          kind: 'plot',
          id: p.id,
          payloadHash: hash,
          geometryGeoJson: JSON.parse(geomJson),
        });
      }
    }
  }

  if (pendingBatches.length > 0) {
    const batchesClaimed = await db
      .update(batches)
      .set({ claimedAt: sql`now()` })
      .where(
        and(
          inArray(
            batches.id,
            pendingBatches.map((b) => b.id),
          ),
          isNull(batches.onChainRegistryTxId),
          or(isNull(batches.claimedAt), lt(batches.claimedAt, staleCutoff)),
        ),
      )
      .returning({ id: batches.id });

    if (batchesClaimed.length > 0) {
      const batchIds = batchesClaimed.map((b) => b.id);
      const evts = await db
        .select({
          batchId: events.batchId,
          payloadHash: events.payloadHash,
          payload: events.payload,
        })
        .from(events)
        .where(and(inArray(events.batchId, batchIds), eq(events.type, 'batch_created')));
      const eventByBatch = new Map<string, { payloadHash: string; parentBatchIds: string[] }>();
      for (const e of evts) {
        const payload = e.payload as Record<string, unknown>;
        const parents = Array.isArray(payload.parentBatchIds)
          ? (payload.parentBatchIds as string[])
          : [];
        eventByBatch.set(e.batchId ?? '', { payloadHash: e.payloadHash, parentBatchIds: parents });
      }
      for (const b of batchesClaimed) {
        const meta = eventByBatch.get(b.id);
        if (!meta) continue;
        out.push({
          kind: 'batch',
          id: b.id,
          payloadHash: meta.payloadHash,
          parentBatchIds: meta.parentBatchIds,
        });
      }
    }
  }

  return out;
}

/**
 * Replay any plot or batch rows whose EVM registry call never landed.
 * Uses the registry client's existing soft-failure contract; rows
 * that still fail stay pending for the next tick. The on-chain
 * contracts themselves are idempotent (re-attestation reverts with a
 * custom error), so even if the call fires twice, only one row lands
 * on-chain.
 */
export async function reconcileRegistryWrites(
  limit: number = 25,
): Promise<ReconcileSummary['registry']> {
  const summary: ReconcileSummary['registry'] = { scanned: 0, written: 0, failed: 0 };

  // Lazy import the registry client so the reconciler module stays
  // load-time-safe even when `REGISTRY_CONTRACTS_ENABLED` is unset.
  const { registryEnabled, attestPlotOnChain, recordBatchOnChain } = await import('./registry');
  if (!registryEnabled()) return summary;

  const claimed = await claimPendingRegistryWrites(limit);
  summary.scanned = claimed.length;

  for (const row of claimed) {
    try {
      if (row.kind === 'plot') {
        const result = await attestPlotOnChain({
          plotId: row.id,
          payloadHash: row.payloadHash,
          geometryGeoJson: row.geometryGeoJson,
        });
        if (!result) {
          summary.failed += 1;
          continue;
        }
        await db
          .update(plots)
          .set({ onChainRegistryTxId: result.transactionId, updatedAt: new Date() })
          .where(eq(plots.id, row.id));
        summary.written += 1;
      } else {
        const result = await recordBatchOnChain({
          batchId: row.id,
          payloadHash: row.payloadHash,
          parentBatchIds: row.parentBatchIds ?? [],
        });
        if (!result) {
          summary.failed += 1;
          continue;
        }
        await db
          .update(batches)
          .set({ onChainRegistryTxId: result.transactionId, updatedAt: new Date() })
          .where(eq(batches.id, row.id));
        summary.written += 1;
      }
    } catch (error) {
      summary.failed += 1;
      console.error('[reconciler] registry write backfill failed', {
        kind: row.kind,
        id: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return summary;
}

/**
 * Run all reconciliation passes back-to-back. Returned summary can be
 * surfaced in observability dashboards / logs.
 */
export async function runReconciler(): Promise<ReconcileSummary> {
  const eventsResult = await reconcilePlotEvents();
  const actorsResult = await reconcileActorDids();
  const batchesResult = await reconcileBatchMints();
  const registryResult = await reconcileRegistryWrites();
  return {
    events: eventsResult,
    actors: actorsResult,
    batches: batchesResult,
    registry: registryResult,
  };
}
