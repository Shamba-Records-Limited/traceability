import { z } from 'zod';

import { commoditySchema, processingStageSchema } from './commodity.js';
import { hederaIdSchema, iso8601Schema, uuidSchema } from './common.js';

/**
 * A unit of commodity at a point in time that is meaningful to track as one.
 * Batches form a directed acyclic graph: a batch may have parent batches
 * (where it was split or merged from) and child batches (where it leads).
 *
 * The on-chain representation is one HCS topic per batch plus an HTS NFT for
 * the lot. The off-chain database is authoritative for queries; on-chain
 * carries commitments and ownership.
 */
export const batchSchema = z.object({
  id: uuidSchema,
  commodity: commoditySchema,
  processingStage: processingStageSchema,
  unit: z.enum(['kg', 'head', 'tonne', 'm3']),
  quantity: z.number().positive(),
  productionStart: iso8601Schema,
  productionEnd: iso8601Schema,
  sourcePlotIds: z.array(uuidSchema).min(1), // all plots that contributed
  parentBatchIds: z.array(uuidSchema).default([]),
  custodianActorId: uuidSchema, // current holder
  onChainTopicId: hederaIdSchema.optional(), // HCS topic
  onChainTokenId: hederaIdSchema.optional(), // HTS NFT token id
  onChainSerialNumber: z.number().int().positive().optional(), // NFT serial within the collection
  status: z.enum(['draft', 'active', 'consumed', 'exhausted', 'voided']),
  createdAt: iso8601Schema,
  updatedAt: iso8601Schema,
});
export type Batch = z.infer<typeof batchSchema>;

/**
 * Inputs accepted by the split operation: a parent batch is consumed and N
 * child batches are minted whose quantities sum to (at most) the parent's.
 * The remainder (parent minus children) is recorded as `loss` for shrinkage
 * and accountancy.
 */
export const batchSplitSchema = z.object({
  parentBatchId: uuidSchema,
  children: z
    .array(
      z.object({
        commodity: commoditySchema,
        processingStage: processingStageSchema,
        unit: z.enum(['kg', 'head', 'tonne', 'm3']),
        quantity: z.number().positive(),
      }),
    )
    .min(1),
  lossQuantity: z.number().nonnegative().default(0),
  performedAt: iso8601Schema,
  performedByActorId: uuidSchema,
  reason: z.string().max(500).optional(),
});
export type BatchSplit = z.infer<typeof batchSplitSchema>;

/**
 * Inputs accepted by the merge operation: multiple parent batches are
 * consumed and one child batch is minted whose quantity equals (or is less
 * than, allowing for shrinkage) the sum of the parents'.
 */
export const batchMergeSchema = z.object({
  parentBatchIds: z.array(uuidSchema).min(2),
  child: z.object({
    commodity: commoditySchema,
    processingStage: processingStageSchema,
    unit: z.enum(['kg', 'head', 'tonne', 'm3']),
    quantity: z.number().positive(),
  }),
  lossQuantity: z.number().nonnegative().default(0),
  performedAt: iso8601Schema,
  performedByActorId: uuidSchema,
  reason: z.string().max(500).optional(),
});
export type BatchMerge = z.infer<typeof batchMergeSchema>;
