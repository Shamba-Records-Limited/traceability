import { and, desc, eq } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { db } from '../../../../../../lib/db';
import { requireApiKey } from '../../../../../../lib/api-auth';

const { batches, events } = schema;

/**
 * GET /api/v1/batches/:id/events
 *
 * Full event stream for a batch (newest first), each row carrying the
 * payload hash, the on-chain HCS topic + sequence (or `null` if still
 * pending), and the actor DID that emitted it. The `payload` itself is
 * intentionally omitted — it's available on a per-event endpoint when
 * we add one; the public stream is the commitment chain.
 *
 * Scopes: `events:read`.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiKey(request, 'events:read');
  if (auth.kind === 'response') return auth.response;

  const { id } = await context.params;
  if (!/^[0-9a-f-]{32,36}$/i.test(id)) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  // Verify the calling actor owns the batch; otherwise return 404 so
  // we don't leak the existence of other custodians' batches via the
  // events endpoint.
  const [own] = await db
    .select({ id: batches.id })
    .from(batches)
    .where(and(eq(batches.id, id), eq(batches.custodianActorId, auth.key.actorId)))
    .limit(1);
  if (!own) return Response.json({ error: 'not_found' }, { status: 404 });

  const rows = await db
    .select({
      id: events.id,
      type: events.type,
      emittedAt: events.emittedAt,
      emittedByDid: events.emittedByDid,
      payloadHash: events.payloadHash,
      payloadCid: events.payloadCid,
      onChainTopicId: events.onChainTopicId,
      onChainSequenceNumber: events.onChainSequenceNumber,
      onChainConsensusTimestamp: events.onChainConsensusTimestamp,
      onChainTransactionId: events.onChainTransactionId,
    })
    .from(events)
    .where(eq(events.batchId, id))
    .orderBy(desc(events.emittedAt), desc(events.id))
    .limit(500);

  return Response.json({
    data: rows.map((row) => ({
      id: row.id,
      type: row.type,
      emittedAt: row.emittedAt.toISOString(),
      emittedByDid: row.emittedByDid,
      payloadHash: row.payloadHash,
      payloadCid: row.payloadCid,
      onChainTopicId: row.onChainTopicId,
      onChainSequenceNumber:
        row.onChainSequenceNumber === null ? null : row.onChainSequenceNumber.toString(),
      onChainConsensusTimestamp: row.onChainConsensusTimestamp?.toISOString() ?? null,
      onChainTransactionId: row.onChainTransactionId,
    })),
  });
}
