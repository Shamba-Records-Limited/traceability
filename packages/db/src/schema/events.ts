import { bigint, char, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { batches } from './batches';
import { eventTypeEnum } from './enums';
import { plots } from './plots';

/**
 * Off-chain canonical record of every traceability event. The on-chain HCS
 * commitment is a hash of `payload` (canonical JSON form) plus the actor's
 * DID-derived signature; we keep the full payload here so the event can be
 * replayed and re-verified.
 *
 * `payload_hash` is the SHA-256 hex of the canonicalised payload, identical
 * to the value committed on chain.
 *
 * Subject linkage is intentionally polymorphic: most events attach to a
 * batch, but plot-level events such as `plot_attested` and
 * `sample_recorded` attach to a plot before any batch exists. Each row
 * carries either `batch_id` or `plot_id` (or both, once a downstream batch
 * cites the plot). At least one must be set; this invariant is enforced at
 * the application layer because expressing it as a check constraint would
 * complicate the eventual full chain-of-custody graph.
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id').references(() => batches.id, { onDelete: 'restrict' }),
    plotId: uuid('plot_id').references(() => plots.id, { onDelete: 'restrict' }),
    type: eventTypeEnum('type').notNull(),
    emittedAt: timestamp('emitted_at', { withTimezone: true }).notNull().defaultNow(),
    emittedByDid: text('emitted_by_did').notNull(),
    payload: jsonb('payload').notNull(),
    payloadHash: char('payload_hash', { length: 64 }).notNull(),
    payloadCid: text('payload_cid'),
    onChainTopicId: text('on_chain_topic_id'),
    onChainSequenceNumber: bigint('on_chain_sequence_number', { mode: 'bigint' }),
    onChainConsensusTimestamp: timestamp('on_chain_consensus_timestamp', { withTimezone: true }),
    onChainTransactionId: text('on_chain_transaction_id'),
  },
  (t) => [
    index('events_batch_idx').on(t.batchId),
    index('events_plot_idx').on(t.plotId),
    index('events_type_idx').on(t.type),
    index('events_emitted_at_idx').on(t.emittedAt),
    index('events_topic_seq_idx').on(t.onChainTopicId, t.onChainSequenceNumber),
  ],
);

export type EventRow = typeof events.$inferSelect;
export type NewEventRow = typeof events.$inferInsert;
