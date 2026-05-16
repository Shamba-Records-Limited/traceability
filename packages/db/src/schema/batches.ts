import {
  bigint,
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { actors } from './actors';
import { batchStatusEnum, batchUnitEnum, commodityEnum, processingStageEnum } from './enums';

/**
 * Traceable units of commodity. Batches form a directed acyclic graph: a
 * batch may have parent batches (where it was split or merged from) and
 * child batches (where it leads). Lineage is tracked in `batch_parents`
 * to keep `batches` flat.
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
    onChainSerialNumber: bigint('on_chain_serial_number', { mode: 'number' }),
    status: batchStatusEnum('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
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
 */
export const batchPlots = pgTable(
  'batch_plots',
  {
    batchId: uuid('batch_id').notNull(),
    plotId: uuid('plot_id').notNull(),
  },
  (t) => [index('batch_plots_batch_idx').on(t.batchId), index('batch_plots_plot_idx').on(t.plotId)],
);

/**
 * Batch lineage: child -> parent edges. The application is responsible for
 * ensuring acyclicity at write time; we don't constrain it at the database
 * level because the check would be O(n) per insert.
 */
export const batchParents = pgTable(
  'batch_parents',
  {
    childBatchId: uuid('child_batch_id').notNull(),
    parentBatchId: uuid('parent_batch_id').notNull(),
  },
  (t) => [
    index('batch_parents_child_idx').on(t.childBatchId),
    index('batch_parents_parent_idx').on(t.parentBatchId),
  ],
);

export type BatchRow = typeof batches.$inferSelect;
export type NewBatchRow = typeof batches.$inferInsert;
