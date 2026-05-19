import { and, eq, inArray, isNull, like, lt, or, sql } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { db } from './db';
import { mintDid } from './did-issuer';
import { mintBatchNft } from './hedera-mint';
import { publishEvent } from './hedera-publisher';
import { PLACEHOLDER_DID_PREFIX } from './actor';

const { actors, batches, events, plots } = schema;

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
  payloadHash: string | null;
}

/**
 * Atomically claim up to `limit` batch rows whose NFT mint never landed.
 * The candidate predicate matches `on_chain_token_id IS NULL`; once the
 * mint backfills the column the row drops out of subsequent scans
 * without needing the claim cleared.
 *
 * The accompanying `batch_created` event carries the payload hash we
 * commit to the NFT metadata, so we pull it out here in the same pass
 * to avoid a second round-trip per claim.
 */
async function claimPendingBatchMints(limit: number): Promise<ClaimedBatchRow[]> {
  const staleCutoff = new Date(Date.now() - CLAIM_TTL_MS);
  const candidates = await db
    .select({ id: batches.id })
    .from(batches)
    .where(
      and(
        isNull(batches.onChainTokenId),
        or(isNull(batches.claimedAt), lt(batches.claimedAt, staleCutoff)),
      ),
    )
    .orderBy(batches.createdAt)
    .limit(limit);

  if (candidates.length === 0) return [];

  const claimed = await db
    .update(batches)
    .set({ claimedAt: sql`now()` })
    .where(
      and(
        inArray(
          batches.id,
          candidates.map((c) => c.id),
        ),
        isNull(batches.onChainTokenId),
        or(isNull(batches.claimedAt), lt(batches.claimedAt, staleCutoff)),
      ),
    )
    .returning({ id: batches.id });

  if (claimed.length === 0) return [];

  // Look up the canonical payload hash for each claimed batch's
  // `batch_created` event so the reconciler can stamp it into the NFT
  // metadata exactly as `createBatch` did on the happy path.
  const eventRows = await db
    .select({ batchId: events.batchId, payloadHash: events.payloadHash })
    .from(events)
    .where(
      and(
        inArray(
          events.batchId,
          claimed.map((c) => c.id),
        ),
        eq(events.type, 'batch_created'),
      ),
    );
  const hashByBatch = new Map(eventRows.map((r) => [r.batchId ?? '', r.payloadHash]));
  return claimed.map((c) => ({ id: c.id, payloadHash: hashByBatch.get(c.id) ?? null }));
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
    if (!row.payloadHash) {
      // No `batch_created` event found for this batch — schema
      // misconfiguration. Leave the lease set so the row doesn't
      // thrash on every tick; it expires after CLAIM_TTL_MS and skips
      // again next tick.
      summary.failed += 1;
      continue;
    }

    const mint = await mintBatchNft({
      tokenId: '',
      name: `Shamba Batch ${row.id.slice(0, 8)}`,
      symbol: 'SHAMBA-BATCH',
      metadata: { batchId: row.id, payloadHash: row.payloadHash, schemaVersion: 1 },
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
        // Belt-and-braces: only stamp rows that are still pending. A
        // concurrent createBatch tick (or a stale lease that expired
        // between our claim and our publish) might have minted
        // already; in that case we leave the row alone.
        const updated = await db
          .update(batches)
          .set({
            onChainTokenId: mint.tokenId,
            onChainSerialNumber: mint.serialNumber,
            onChainMintTransactionId: mint.transactionId,
            status: 'active',
            updatedAt: new Date(),
          })
          .where(and(eq(batches.id, row.id), isNull(batches.onChainTokenId)))
          .returning({ id: batches.id });
        if (updated.length === 1) {
          summary.minted += 1;
        } else {
          console.warn('[reconciler] batch row no longer pending; skipping mint stamp', {
            batchId: row.id,
            tokenId: mint.tokenId,
          });
        }
        backfilled = true;
      } catch (error) {
        if (attempt === backoffMs.length - 1) {
          console.error(
            '[reconciler] NFT mint succeeded but batch backfill failed after retries; row is in split-brain (NFT minted on Hedera but DB columns NULL), next tick may produce a duplicate NFT',
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

/**
 * Run all reconciliation passes back-to-back. Returned summary can be
 * surfaced in observability dashboards / logs.
 */
export async function runReconciler(): Promise<ReconcileSummary> {
  const eventsResult = await reconcilePlotEvents();
  const actorsResult = await reconcileActorDids();
  const batchesResult = await reconcileBatchMints();
  return { events: eventsResult, actors: actorsResult, batches: batchesResult };
}
