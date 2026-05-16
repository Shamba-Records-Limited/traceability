import { z } from 'zod';

/**
 * Commodities listed in Annex I of EU Regulation 2023/1115 (EUDR).
 *
 * The platform supports all seven from day one; commodity-specific behaviour
 * (units, lot transformations, sampling protocols) is delegated to per-commodity
 * adapters elsewhere in the codebase.
 *
 * Non-EUDR commodities can be added later for non-EU markets; we use a closed
 * enum here to keep the EUDR pipeline correct by construction.
 */
export const commoditySchema = z.enum([
  'cattle',
  'cocoa',
  'coffee',
  'oil_palm',
  'rubber',
  'soya',
  'wood',
]);
export type Commodity = z.infer<typeof commoditySchema>;

/**
 * Default unit of measure per commodity. Operators may override per-batch,
 * but this is the unit assumed when none is specified.
 */
export const commodityDefaultUnit: Record<Commodity, 'kg' | 'head'> = {
  cattle: 'head',
  cocoa: 'kg',
  coffee: 'kg',
  oil_palm: 'kg',
  rubber: 'kg',
  soya: 'kg',
  wood: 'kg',
};

/**
 * Stage of processing for a given commodity. Used to disambiguate lots of
 * "coffee" that are at very different states in the supply chain (cherry vs
 * parchment vs green vs roasted, for example).
 */
export const processingStageSchema = z.enum([
  'raw',
  'primary_processed',
  'secondary_processed',
  'finished',
]);
export type ProcessingStage = z.infer<typeof processingStageSchema>;
