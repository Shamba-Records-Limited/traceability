import { z } from 'zod';

import { commoditySchema } from './commodity.js';
import { countryCodeSchema, iso8601Schema, uuidSchema } from './common.js';
import { plotGeometrySchema } from './geometry.js';

/**
 * Per-plot deforestation check, recorded as the platform sees it at the time
 * the check was run. The provider, version, and evidence pointer are recorded
 * so the result can be reconstructed and re-verified.
 *
 * EUDR cut-off date is 31 December 2020 (Article 2 + Article 3 definition of
 * "deforestation-free"). Any forest cover loss detected on the plot after that
 * date is, on its face, a non-compliance.
 */
export const deforestationCheckSchema = z.object({
  provider: z.string().min(1).max(80), // e.g. 'global_forest_watch', 'jrc_gfc', 'sentinel_hub'
  providerVersion: z.string().max(80).optional(),
  cutOffDate: iso8601Schema, // canonical: 2020-12-31T23:59:59Z
  performedAt: iso8601Schema,
  deforestationDetected: z.boolean(),
  hectaresLostAfterCutOff: z.number().nonnegative().optional(),
  evidenceCid: z.string().optional(), // IPFS CID for the raw provider response / raster snapshot
  notes: z.string().max(2000).optional(),
});
export type DeforestationCheck = z.infer<typeof deforestationCheckSchema>;

/**
 * A plot of land producing one or more commodities. Geometry is stored
 * in WGS 84; plots > 4 ha must use a Polygon (enforced by superRefine).
 */
export const plotSchema = z
  .object({
    id: uuidSchema,
    ownerActorId: uuidSchema, // the farmer or cooperative responsible for the plot
    country: countryCodeSchema,
    subnational: z.string().max(200).optional(),
    commodities: z.array(commoditySchema).min(1),
    geometry: plotGeometrySchema,
    areaHectares: z.number().positive(),
    registeredAt: iso8601Schema,
    deforestationChecks: z.array(deforestationCheckSchema).default([]),
    onChainCommitmentTopicId: z.string().optional(), // HCS topic for plot-level events
    createdAt: iso8601Schema,
    updatedAt: iso8601Schema,
  })
  .superRefine((plot, ctx) => {
    if (plot.areaHectares > 4 && plot.geometry.type !== 'Polygon') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'plots larger than 4 hectares must use a Polygon geometry (EUDR Article 9(1)(d))',
        path: ['geometry'],
      });
    }
  });
export type Plot = z.infer<typeof plotSchema>;
