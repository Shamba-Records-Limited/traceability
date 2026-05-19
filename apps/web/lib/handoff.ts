import { createHash, randomUUID } from 'node:crypto';

import { and, desc, eq, or } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { db } from './db';
import { publishEvent } from './hedera-publisher';
import { transferNft } from './hedera-transfer';

const { actors, batches, events, handoffs } = schema;

const BATCH_UNITS = ['kg', 'head', 'tonne', 'm3'] as const;
type BatchUnit = (typeof BATCH_UNITS)[number];

export class HandoffError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'HandoffError';
  }
}

export interface ProposeHandoffInput {
  batchId: string;
  fromActorId: string;
  toActorDid: string;
  quantity: number;
  unit: BatchUnit;
  notes?: string;
}

/**
 * Propose a custody transfer from `fromActorId` to the actor identified
 * by `toActorDid`. Persists the handoff in `proposed` state and emits a
 * `handoff_proposed` event with the HCS commitment. The receiving actor
 * accepts via `acceptHandoff`; either side can cancel before then.
 */
export async function proposeHandoff(input: ProposeHandoffInput): Promise<{
  handoffId: string;
  eventId: string;
  onChainTopicId: string | null;
}> {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new HandoffError(400, 'quantity must be a positive number');
  }
  if (!BATCH_UNITS.includes(input.unit)) {
    throw new HandoffError(400, `unit must be one of ${BATCH_UNITS.join(', ')}`);
  }

  const [batch] = await db
    .select({
      id: batches.id,
      custodianActorId: batches.custodianActorId,
      status: batches.status,
      quantity: batches.quantity,
      unit: batches.unit,
    })
    .from(batches)
    .where(eq(batches.id, input.batchId))
    .limit(1);
  if (!batch) throw new HandoffError(404, 'batch not found');
  if (batch.custodianActorId !== input.fromActorId) {
    throw new HandoffError(403, 'only the current custodian can propose a handoff');
  }
  if (batch.status === 'voided' || batch.status === 'consumed') {
    throw new HandoffError(409, `cannot propose a handoff for a ${batch.status} batch`);
  }
  if (input.quantity > batch.quantity) {
    throw new HandoffError(400, 'handoff quantity cannot exceed the batch quantity');
  }
  if (input.unit !== batch.unit) {
    throw new HandoffError(400, `handoff unit must match the batch unit (${batch.unit})`);
  }

  const [from] = await db
    .select({ id: actors.id, did: actors.did })
    .from(actors)
    .where(eq(actors.id, input.fromActorId))
    .limit(1);
  if (!from) throw new HandoffError(404, 'sender actor not found');

  const [to] = await db
    .select({ id: actors.id, did: actors.did, displayName: actors.displayName })
    .from(actors)
    .where(eq(actors.did, input.toActorDid))
    .limit(1);
  if (!to) {
    throw new HandoffError(
      404,
      'receiver DID not registered. The receiver must onboard before they can be handed a batch.',
    );
  }
  if (to.id === from.id) {
    throw new HandoffError(400, 'cannot hand a batch off to yourself');
  }

  // Any pending handoff for this batch must settle first; one outstanding
  // handoff at a time keeps the chain-of-custody graph unambiguous.
  const pending = await db
    .select({ id: handoffs.id, status: handoffs.status })
    .from(handoffs)
    .where(
      and(
        eq(handoffs.batchId, input.batchId),
        or(
          eq(handoffs.status, 'proposed'),
          eq(handoffs.status, 'in_transit'),
          eq(handoffs.status, 'pending_receipt'),
        ),
      ),
    );
  if (pending.length > 0) {
    throw new HandoffError(
      409,
      `batch ${input.batchId} already has an outstanding handoff (${pending[0]!.id} in status ${pending[0]!.status})`,
    );
  }

  const eventId = randomUUID();
  const now = new Date();

  const { handoffId, payloadHash, eventCommitment } = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(handoffs)
      .values({
        batchId: input.batchId,
        fromActorId: from.id,
        toActorId: to.id,
        status: 'proposed',
        quantity: input.quantity,
        unit: input.unit,
        notes: input.notes?.trim() || null,
      })
      .returning({ id: handoffs.id });
    if (!row) throw new Error('handoff insert returned no rows');

    const eventPayload = {
      v: 1 as const,
      type: 'handoff_proposed' as const,
      handoffId: row.id,
      batchId: input.batchId,
      fromActorId: from.id,
      fromDid: from.did,
      toActorId: to.id,
      toDid: to.did,
      quantity: input.quantity,
      unit: input.unit,
      notes: input.notes?.trim() || undefined,
      proposedAt: now.toISOString(),
    };
    const canonical = JSON.stringify(eventPayload);
    const payloadHashInner = createHash('sha256').update(canonical, 'utf8').digest('hex');

    await tx.insert(events).values({
      id: eventId,
      batchId: input.batchId,
      type: 'handoff_proposed',
      emittedAt: now,
      emittedByDid: from.did,
      payload: eventPayload,
      payloadHash: payloadHashInner,
    });

    const commitment = {
      v: 1 as const,
      type: 'handoff_proposed' as const,
      handoffId: row.id,
      batchId: input.batchId,
      emittedAt: now.toISOString(),
      emittedByDid: from.did,
      payloadHash: payloadHashInner,
    };

    return { handoffId: row.id, payloadHash: payloadHashInner, eventCommitment: commitment };
  });

  // Soft-failure HCS publish.
  const publish = await publishEvent('', eventCommitment);
  if (publish) {
    try {
      await db
        .update(events)
        .set({
          onChainTopicId: publish.topicId,
          onChainSequenceNumber: publish.sequenceNumber,
          onChainConsensusTimestamp: new Date(publish.consensusTimestamp),
          onChainTransactionId: publish.transactionId,
        })
        .where(eq(events.id, eventId));
    } catch (error) {
      console.error('[handoff] HCS publish succeeded but backfill failed', {
        handoffId,
        eventId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  void payloadHash;

  return {
    handoffId,
    eventId,
    onChainTopicId: publish?.topicId ?? null,
  };
}

export interface AcceptHandoffInput {
  handoffId: string;
  toActorId: string;
}

/**
 * Accept a previously-proposed handoff. The caller must be the
 * receiver. Updates the handoff to `received`, transfers the batch
 * custody to the receiver, attempts an on-chain HTS NFT transfer (soft
 * failure), and emits a `handoff_received` event.
 */
export async function acceptHandoff(input: AcceptHandoffInput): Promise<{
  handoffId: string;
  eventId: string;
  onChainTransferTxId: string | null;
  onChainTopicId: string | null;
}> {
  const [handoff] = await db
    .select({
      id: handoffs.id,
      batchId: handoffs.batchId,
      fromActorId: handoffs.fromActorId,
      toActorId: handoffs.toActorId,
      status: handoffs.status,
      quantity: handoffs.quantity,
      unit: handoffs.unit,
    })
    .from(handoffs)
    .where(eq(handoffs.id, input.handoffId))
    .limit(1);
  if (!handoff) throw new HandoffError(404, 'handoff not found');
  if (handoff.toActorId !== input.toActorId) {
    throw new HandoffError(403, 'only the designated receiver can accept this handoff');
  }
  if (
    handoff.status !== 'proposed' &&
    handoff.status !== 'in_transit' &&
    handoff.status !== 'pending_receipt'
  ) {
    throw new HandoffError(409, `handoff is already ${handoff.status}`);
  }

  const [batch] = await db
    .select({
      id: batches.id,
      custodianActorId: batches.custodianActorId,
      onChainTokenId: batches.onChainTokenId,
      onChainSerialNumber: batches.onChainSerialNumber,
    })
    .from(batches)
    .where(eq(batches.id, handoff.batchId))
    .limit(1);
  if (!batch) throw new HandoffError(404, 'batch not found');
  if (batch.custodianActorId !== handoff.fromActorId) {
    throw new HandoffError(409, 'batch custodian no longer matches the handoff sender');
  }

  const [fromActor] = await db
    .select({ did: actors.did, hederaAccountId: actors.hederaAccountId })
    .from(actors)
    .where(eq(actors.id, handoff.fromActorId))
    .limit(1);
  const [toActor] = await db
    .select({ did: actors.did, hederaAccountId: actors.hederaAccountId })
    .from(actors)
    .where(eq(actors.id, handoff.toActorId))
    .limit(1);
  if (!fromActor || !toActor) {
    throw new HandoffError(500, 'actor row missing while accepting handoff');
  }

  // Attempt the on-chain NFT transfer. Requires both sides to have a
  // Hedera account id on file AND the batch to have its NFT minted.
  let transferTxId: string | null = null;
  if (
    batch.onChainTokenId &&
    batch.onChainSerialNumber !== null &&
    fromActor.hederaAccountId &&
    toActor.hederaAccountId
  ) {
    const transfer = await transferNft({
      tokenId: batch.onChainTokenId,
      serialNumber: batch.onChainSerialNumber.toString(),
      fromAccount: fromActor.hederaAccountId,
      toAccount: toActor.hederaAccountId,
    });
    transferTxId = transfer?.transactionId ?? null;
  }

  const eventId = randomUUID();
  const now = new Date();

  const { eventCommitment } = await db.transaction(async (tx) => {
    await tx
      .update(handoffs)
      .set({ status: 'received', receivedAt: now })
      .where(eq(handoffs.id, handoff.id));
    await tx
      .update(batches)
      .set({ custodianActorId: handoff.toActorId, updatedAt: now })
      .where(eq(batches.id, handoff.batchId));

    const eventPayload = {
      v: 1 as const,
      type: 'handoff_received' as const,
      handoffId: handoff.id,
      batchId: handoff.batchId,
      fromActorId: handoff.fromActorId,
      fromDid: fromActor.did,
      toActorId: handoff.toActorId,
      toDid: toActor.did,
      quantity: handoff.quantity,
      unit: handoff.unit,
      onChainTransferTxId: transferTxId,
      receivedAt: now.toISOString(),
    };
    const canonical = JSON.stringify(eventPayload);
    const payloadHash = createHash('sha256').update(canonical, 'utf8').digest('hex');

    await tx.insert(events).values({
      id: eventId,
      batchId: handoff.batchId,
      type: 'handoff_received',
      emittedAt: now,
      emittedByDid: toActor.did,
      payload: eventPayload,
      payloadHash,
    });

    const commitment = {
      v: 1 as const,
      type: 'handoff_received' as const,
      handoffId: handoff.id,
      batchId: handoff.batchId,
      emittedAt: now.toISOString(),
      emittedByDid: toActor.did,
      payloadHash,
    };

    return { eventCommitment: commitment };
  });

  const publish = await publishEvent('', eventCommitment);
  if (publish) {
    try {
      await db
        .update(events)
        .set({
          onChainTopicId: publish.topicId,
          onChainSequenceNumber: publish.sequenceNumber,
          onChainConsensusTimestamp: new Date(publish.consensusTimestamp),
          onChainTransactionId: publish.transactionId,
        })
        .where(eq(events.id, eventId));
    } catch (error) {
      console.error('[handoff] receive HCS publish backfill failed', {
        handoffId: handoff.id,
        eventId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    handoffId: handoff.id,
    eventId,
    onChainTransferTxId: transferTxId,
    onChainTopicId: publish?.topicId ?? null,
  };
}

/**
 * Cancel an outstanding handoff. Either side (sender or receiver) can
 * cancel before the handoff is received. Marks the row `cancelled`
 * and emits no on-chain commitment — cancellations are off-chain only.
 */
export async function cancelHandoff(input: {
  handoffId: string;
  callerActorId: string;
}): Promise<void> {
  const [handoff] = await db
    .select({
      id: handoffs.id,
      fromActorId: handoffs.fromActorId,
      toActorId: handoffs.toActorId,
      status: handoffs.status,
    })
    .from(handoffs)
    .where(eq(handoffs.id, input.handoffId))
    .limit(1);
  if (!handoff) throw new HandoffError(404, 'handoff not found');
  if (handoff.fromActorId !== input.callerActorId && handoff.toActorId !== input.callerActorId) {
    throw new HandoffError(403, 'only the sender or receiver can cancel this handoff');
  }
  if (handoff.status === 'received') {
    throw new HandoffError(409, 'handoff has already been received');
  }
  if (handoff.status === 'cancelled') return;

  await db.update(handoffs).set({ status: 'cancelled' }).where(eq(handoffs.id, handoff.id));
}

export async function listOutgoingHandoffs(actorId: string) {
  return db
    .select({
      id: handoffs.id,
      batchId: handoffs.batchId,
      toActorId: handoffs.toActorId,
      status: handoffs.status,
      quantity: handoffs.quantity,
      unit: handoffs.unit,
      notes: handoffs.notes,
      proposedAt: handoffs.proposedAt,
      receivedAt: handoffs.receivedAt,
    })
    .from(handoffs)
    .where(eq(handoffs.fromActorId, actorId))
    .orderBy(desc(handoffs.proposedAt))
    .limit(100);
}

export async function listIncomingHandoffs(actorId: string) {
  return db
    .select({
      id: handoffs.id,
      batchId: handoffs.batchId,
      fromActorId: handoffs.fromActorId,
      status: handoffs.status,
      quantity: handoffs.quantity,
      unit: handoffs.unit,
      notes: handoffs.notes,
      proposedAt: handoffs.proposedAt,
      receivedAt: handoffs.receivedAt,
    })
    .from(handoffs)
    .where(eq(handoffs.toActorId, actorId))
    .orderBy(desc(handoffs.proposedAt))
    .limit(100);
}
