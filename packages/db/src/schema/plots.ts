import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { commodityEnum } from './enums';
import { geography } from './columns';
import { actors } from './actors';

/**
 * Plots of land producing one or more commodities. EUDR Article 9(1)(d)
 * requires WGS 84 (SRID 4326) geometry; plots > 4 ha must be polygons,
 * smaller plots may be points. The polygon-vs-point invariant is enforced
 * by the application via `plotSchema.superRefine` in shared-types.
 *
 * The geometry column is `geography(GEOMETRY, 4326)` — wide enough to hold
 * both points and polygons, indexed via GIST. A separate
 * `area_hectares` field is maintained in lock-step with the geometry to
 * support filtering without a function call.
 */
export const plots = pgTable(
  'plots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerActorId: uuid('owner_actor_id')
      .notNull()
      .references(() => actors.id, { onDelete: 'restrict' }),
    country: char('country', { length: 2 }).notNull(),
    subnational: text('subnational'),
    commodities: commodityEnum('commodities').array().notNull(),
    geometry: geography({ type: 'GEOMETRY', srid: 4326 })('geometry').notNull(),
    areaHectares: doublePrecision('area_hectares').notNull(),
    onChainCommitmentTopicId: text('on_chain_commitment_topic_id'),
    /**
     * Hedera EVM transaction id from a successful `PlotRegistry.attestPlot`
     * call (the contract registry layered on top of the HCS commitment
     * per ADR-0008). `null` if the registry is disabled in this
     * environment OR the call soft-failed and is pending a reconciler
     * retry.
     */
    onChainRegistryTxId: text('on_chain_registry_tx_id'),
    registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('plots_owner_idx').on(t.ownerActorId),
    index('plots_country_idx').on(t.country),
    // GIST index on geometry — required for any spatial query to be fast.
    index('plots_geometry_gix').using('gist', t.geometry),
  ],
);

/**
 * Per-plot deforestation check, recorded as the platform observed it at the
 * time the check was run. Provider, version, and evidence pointer are
 * persisted so the result can be re-verified by any auditor.
 */
export const deforestationChecks = pgTable(
  'deforestation_checks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    plotId: uuid('plot_id')
      .notNull()
      .references(() => plots.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerVersion: text('provider_version'),
    cutOffDate: timestamp('cut_off_date', { withTimezone: true }).notNull(),
    performedAt: timestamp('performed_at', { withTimezone: true }).notNull().defaultNow(),
    deforestationDetected: boolean('deforestation_detected').notNull(),
    hectaresLostAfterCutOff: doublePrecision('hectares_lost_after_cut_off'),
    evidenceCid: text('evidence_cid'),
    notes: text('notes'),
    raw: jsonb('raw').default(sql`'{}'::jsonb`),
  },
  (t) => [index('deforestation_checks_plot_idx').on(t.plotId)],
);

export type PlotRow = typeof plots.$inferSelect;
export type NewPlotRow = typeof plots.$inferInsert;
export type DeforestationCheckRow = typeof deforestationChecks.$inferSelect;
export type NewDeforestationCheckRow = typeof deforestationChecks.$inferInsert;
