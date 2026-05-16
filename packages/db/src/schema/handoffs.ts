import {
  boolean,
  char,
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { actors } from './actors';
import { batches } from './batches';
import { batchUnitEnum, handoffStatusEnum } from './enums';

/**
 * Chain-of-custody handoffs between actors. The receiver must confirm
 * receipt for the handoff to settle; until then the handoff sits in
 * `pending_receipt`. Optional escrow fields refer to a Hedera EVM contract
 * holding payment funds released on receipt (see ADR-0002).
 */
export const handoffs = pgTable(
  'handoffs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => batches.id, { onDelete: 'restrict' }),
    fromActorId: uuid('from_actor_id')
      .notNull()
      .references(() => actors.id, { onDelete: 'restrict' }),
    toActorId: uuid('to_actor_id')
      .notNull()
      .references(() => actors.id, { onDelete: 'restrict' }),
    status: handoffStatusEnum('status').notNull().default('proposed'),
    quantity: doublePrecision('quantity').notNull(),
    unit: batchUnitEnum('unit').notNull(),
    notes: text('notes'),
    proposedAt: timestamp('proposed_at', { withTimezone: true }).notNull().defaultNow(),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    fromSignatureHash: char('from_signature_hash', { length: 64 }),
    toSignatureHash: char('to_signature_hash', { length: 64 }),
    escrowContractAddress: text('escrow_contract_address'),
    escrowReleased: boolean('escrow_released').notNull().default(false),
  },
  (t) => [
    index('handoffs_batch_idx').on(t.batchId),
    index('handoffs_from_idx').on(t.fromActorId),
    index('handoffs_to_idx').on(t.toActorId),
    index('handoffs_status_idx').on(t.status),
  ],
);

export type HandoffRow = typeof handoffs.$inferSelect;
export type NewHandoffRow = typeof handoffs.$inferInsert;
