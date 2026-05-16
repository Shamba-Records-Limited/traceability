import { bigint, char, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { batches } from './batches';
import { eventTypeEnum } from './enums';

/**
 * Off-chain canonical record of every traceability event. The on-chain HCS
 * commitment is a hash of `payload` (canonical JSON form) plus the actor's
 * DID-derived signature; we keep the full payload here so the event can be
 * replayed and re-verified.
 *
 * `payload_hash` is the SHA-256 hex of the canonicalised payload, identical
 * to the value committed on chain.
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => batches.id, { onDelete: 'restrict' }),
    type: eventTypeEnum('type').notNull(),
    emittedAt: timestamp('emitted_at', { withTimezone: true }).notNull().defaultNow(),
    emittedByDid: text('emitted_by_did').notNull(),
    payload: jsonb('payload').notNull(),
    payloadHash: char('payload_hash', { length: 64 }).notNull(),
    payloadCid: text('payload_cid'),
    onChainTopicId: text('on_chain_topic_id'),
    onChainSequenceNumber: bigint('on_chain_sequence_number', { mode: 'number' }),
    onChainConsensusTimestamp: timestamp('on_chain_consensus_timestamp', { withTimezone: true }),
    onChainTransactionId: text('on_chain_transaction_id'),
  },
  (t) => [
    index('events_batch_idx').on(t.batchId),
    index('events_type_idx').on(t.type),
    index('events_emitted_at_idx').on(t.emittedAt),
    index('events_topic_seq_idx').on(t.onChainTopicId, t.onChainSequenceNumber),
  ],
);

export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
