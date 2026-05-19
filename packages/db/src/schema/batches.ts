import {
  bigint,
  doublePrecision,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { actors } from './actors';
import { plots } from './plots';
import { batchStatusEnum, batchUnitEnum, commodityEnum, processingStageEnum } from './enums';

/**
 * Traceable units of commodity. Batches form a directed acyclic graph: a
 * batch may have parent batches (where it was split or merged from) and
 * child batches (where it leads). Lineage is tracked in `batch_parents`
 * to keep `batches` flat.
 *
 * `onChainSerialNumber` uses `mode: 'bigint'` because Hedera HTS NFT serial
 * numbers can exceed 2^53 - 1 over the lifetime of a long-lived collection;
 * the JS `bigint` type preserves precision at the cost of forcing callers to
 * branch on `typeof === 'bigint'`. Same logic applies to `onChainSequenceNumber`
 * on the events table.
 */
export const batches = pgTable(
  'batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    commodity: commodityEnum('commodity').notNull(),
    processingStage: processingStageEnum('processing_stage').notNull(),
    unit: batchUnitEnum('unit').notNull(),
    quantity: doublePrecision('quantity').notNull(),
    productionStart: timestamp('production_start', { withTimezone: true }).notNull(),
    productionEnd: timestamp('production_end', { withTimezone: true }).notNull(),
    custodianActorId: uuid('custodian_actor_id')
      .notNull()
      .references(() => actors.id, { onDelete: 'restrict' }),
    onChainTopicId: text('on_chain_topic_id'),
    onChainTokenId: text('on_chain_token_id'),
    onChainSerialNumber: bigint('on_chain_serial_number', { mode: 'bigint' }),
    onChainMintTransactionId: text('on_chain_mint_transaction_id'),
    /**
     * Hedera EVM transaction id from a successful `BatchRegistry.recordBatch`
     * call. `null` if the registry is disabled in this environment OR
     * the call soft-failed; see ADR-0008.
     */
    onChainRegistryTxId: text('on_chain_registry_tx_id'),
    status: batchStatusEnum('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * Reconciler lease timestamp. Non-null means a worker is currently
     * attempting to mint or rotate the on-chain NFT for this batch. Same
     * claim-before-publish pattern as `actors.claimed_at` and
     * `events.claimed_at` in migration 0003 — stops two cron ticks from
     * minting duplicate NFTs for the same batch.
     */
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
  },
  (t) => [
    index('batches_commodity_idx').on(t.commodity),
    index('batches_custodian_idx').on(t.custodianActorId),
    index('batches_status_idx').on(t.status),
    index('batches_token_idx').on(t.onChainTokenId, t.onChainSerialNumber),
  ],
);

/**
 * Batches contributed by which plots. Many-to-many join because (a) a batch
 * may aggregate multiple plots' produce and (b) a plot's seasonal yield can
 * land in multiple batches.
 *
 * Composite primary key on (batchId, plotId) prevents duplicate edges; both
 * columns are foreign keys with cascade-on-delete so removing a batch or
 * plot cleans up its membership rows automatically.
 */
export const batchPlots = pgTable(
  'batch_plots',
  {
    batchId: uuid('batch_id')
      .notNull()
      .references(() => batches.id, { onDelete: 'cascade' }),
    plotId: uuid('plot_id')
      .notNull()
      .references(() => plots.id, { onDelete: 'restrict' }),
  },
  (t) => [
    primaryKey({ columns: [t.batchId, t.plotId] }),
    index('batch_plots_plot_idx').on(t.plotId),
  ],
);

/**
 * Batch lineage: child -> parent edges. The application is responsible for
 * ensuring acyclicity at write time; we don't constrain it at the database
 * level because the check would be O(n) per insert.
 *
 * Composite primary key on (childBatchId, parentBatchId) prevents duplicate
 * edges. Both columns reference `batches.id`; deleting a batch cascades
 * across both directions to avoid dangling lineage rows.
 */
export const batchParents = pgTable(
  'batch_parents',
  {
    childBatchId: uuid('child_batch_id')
      .notNull()
      .references(() => batches.id, { onDelete: 'cascade' }),
    parentBatchId: uuid('parent_batch_id')
      .notNull()
      .references(() => batches.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.childBatchId, t.parentBatchId] }),
    index('batch_parents_parent_idx').on(t.parentBatchId),
  ],
);

export type BatchRow = typeof batches.$inferSelect;
export type NewBatchRow = typeof batches.$inferInsert;
