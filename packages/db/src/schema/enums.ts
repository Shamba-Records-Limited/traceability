import { pgEnum } from 'drizzle-orm/pg-core';

/**
 * Postgres enum types mirror the closed unions in `@shamba/shared-types`.
 * Keep these in lock-step with the Zod enums; a future PR adds a generator
 * that emits the Drizzle enums from the shared-types module to make drift
 * impossible.
 */

export const actorRoleEnum = pgEnum('actor_role', [
  'farmer',
  'cooperative',
  'processor',
  'exporter',
  'importer',
  'auditor',
  'competent_authority',
]);

/**
 * Commodity catalog. The first seven values are the EUDR Annex I
 * commodities; the remainder are non-EUDR commodities (Kenyan agri
 * exports + common cross-border crops). The EUDR pipeline narrows to
 * the Annex I subset in `@shamba/shared-types` via `eudrCommoditySchema`
 * — see the union there for the architectural rationale.
 */
export const commodityEnum = pgEnum('commodity', [
  // EUDR Annex I
  'cattle',
  'cocoa',
  'coffee',
  'oil_palm',
  'rubber',
  'soya',
  'wood',
  // Extended (non-EUDR)
  'tea',
  'avocado',
  'macadamia',
  'cashew',
  'beans',
  'maize',
  'sugarcane',
  'banana',
  'mango',
  'flowers',
  'dairy',
  'fish',
  'pyrethrum',
  'sisal',
  'cassava',
]);

export const processingStageEnum = pgEnum('processing_stage', [
  'raw',
  'primary_processed',
  'secondary_processed',
  'finished',
]);

export const batchUnitEnum = pgEnum('batch_unit', ['kg', 'head', 'tonne', 'm3']);

export const batchStatusEnum = pgEnum('batch_status', [
  'draft',
  'active',
  'consumed',
  'exhausted',
  'voided',
]);

export const handoffStatusEnum = pgEnum('handoff_status', [
  'proposed',
  'in_transit',
  'pending_receipt',
  'received',
  'disputed',
  'cancelled',
]);

export const eventTypeEnum = pgEnum('event_type', [
  'batch_created',
  'plot_attested',
  'sample_recorded',
  'certification_attached',
  'handoff_proposed',
  'handoff_dispatched',
  'handoff_received',
  'batch_split',
  'batch_merged',
  'batch_exported',
  'batch_imported',
  'dds_issued',
  'dds_accepted',
  'batch_voided',
]);
