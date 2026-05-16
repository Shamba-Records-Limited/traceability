import { and, eq, isNull, like } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { db } from './db';
import { mintDid } from './did-issuer';
import { publishEvent } from './hedera-publisher';
import { PLACEHOLDER_DID_PREFIX } from './actor';

const { actors, events, plots } = schema;

/**
 * The reconciler does the housekeeping our happy paths can't promise:
 * picking up rows where the on-chain side of a write soft-failed earlier,
 * and replaying the network call. It is the system's recovery mechanism
 * for the soft-failure contract in `lib/hedera-publisher.ts` and
 * `lib/did-issuer.ts`.
 *
 * Two work queues:
 *
 *   1. `events` with `on_chain_topic_id IS NULL` — `plot_attested` (and
 *      future event types) that were persisted off-chain but never made it
 *      to HCS. We rebuild the `EventCommitment` from the persisted row and
 *      retry `publishEvent`. On success we backfill `events.on_chain_*`
 *      and, for plot-level events, `plots.on_chain_commitment_topic_id`.
 *
 *   2. `actors` with `did LIKE 'did:placeholder:%'` — onboarding rows whose
 *      did-issuer call failed. We retry `mintDid` and rotate the row.
 *
 * Each pass is capped by a `limit` so a single tick cannot run unboundedly
 * long on Vercel's request-time budget. The cron schedule (see
 * `vercel.ts`) re-fires the route every few minutes, so a backlog drains
 * across ticks.
 *
 * Idempotency: every retry is safe to repeat. A successful retry results
 * in an UPDATE that flips the null columns; a follow-up tick simply
 * finds nothing to do.
 */

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
}

const DEFAULT_EVENT_LIMIT = 50;
const DEFAULT_ACTOR_LIMIT = 25;

interface PendingEventRow {
  id: string;
  type: string;
  plotId: string | null;
  batchId: string | null;
  emittedAt: Date;
  emittedByDid: string;
  payloadHash: string;
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

  const pending = (await db
    .select({
      id: events.id,
      type: events.type,
      plotId: events.plotId,
      batchId: events.batchId,
      emittedAt: events.emittedAt,
      emittedByDid: events.emittedByDid,
      payloadHash: events.payloadHash,
    })
    .from(events)
    .where(isNull(events.onChainTopicId))
    .orderBy(events.emittedAt)
    .limit(limit)) satisfies PendingEventRow[];

  summary.scanned = pending.length;

  for (const row of pending) {
    if (!row.plotId && !row.batchId) {
      // Defensive: every event must attach to a plot or a batch. If neither
      // is present the row is malformed (only possible via a schema
      // migration mistake) and the publisher can't accept it.
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

interface PendingActorRow {
  id: string;
  displayName: string;
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

  const pending = (await db
    .select({ id: actors.id, displayName: actors.displayName })
    .from(actors)
    .where(like(actors.did, `${PLACEHOLDER_DID_PREFIX}%`))
    .orderBy(actors.createdAt)
    .limit(limit)) satisfies PendingActorRow[];

  summary.scanned = pending.length;

  for (const row of pending) {
    const mint = await mintDid({ actorId: row.id, displayName: row.displayName });
    if (!mint) {
      summary.failed += 1;
      continue;
    }

    try {
      // Belt-and-braces: only rotate rows that still look like a
      // placeholder. A concurrent onboarding tick (or a previous
      // reconciler run) might have rotated the row already; in that case
      // we leave it alone and count it as a skip-shaped success.
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

/**
 * Run both reconciliation passes back-to-back. Returned summary can be
 * surfaced in observability dashboards / logs.
 */
export async function runReconciler(): Promise<ReconcileSummary> {
  const eventsResult = await reconcilePlotEvents();
  const actorsResult = await reconcileActorDids();
  return { events: eventsResult, actors: actorsResult };
}
