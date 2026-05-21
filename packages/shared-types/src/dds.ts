import { z } from 'zod';

import { eudrCommoditySchema } from './commodity';
import { countryCodeSchema, iso8601Schema, uuidSchema } from './common';
import { plotGeometrySchema } from './geometry';

/**
 * Shamba's internal representation of an EUDR Due Diligence Statement (DDS).
 *
 * This type is the canonical input we pass to the `services/dds-generator`
 * service, which produces (a) a JSON document conforming to the European
 * Commission's published DDS schema, and (b) a human-readable PDF rendering.
 *
 * Field semantics track Article 9 of Regulation (EU) 2023/1115. See
 * `docs/compliance/eudr-mapping.md` for the article-by-article mapping.
 */

export const ddsRiskLevelSchema = z.enum(['low', 'standard', 'high']);
export type DdsRiskLevel = z.infer<typeof ddsRiskLevelSchema>;

export const ddsPlotReferenceSchema = z.object({
  plotId: uuidSchema,
  country: countryCodeSchema,
  subnational: z.string().max(200).optional(),
  geometry: plotGeometrySchema,
  areaHectares: z.number().positive(),
  productionStart: iso8601Schema,
  productionEnd: iso8601Schema,
  deforestationFree: z.boolean(),
  deforestationProvider: z.string().max(80),
  deforestationCheckedAt: iso8601Schema,
});
export type DdsPlotReference = z.infer<typeof ddsPlotReferenceSchema>;

export const ddsSupplierReferenceSchema = z.object({
  actorId: uuidSchema,
  legalName: z.string().min(1).max(200),
  country: countryCodeSchema,
  contactEmail: z.string().email().optional(),
});
export type DdsSupplierReference = z.infer<typeof ddsSupplierReferenceSchema>;

export const ddsSchema = z.object({
  id: uuidSchema,
  operatorActorId: uuidSchema, // the EU operator/importer submitting the DDS
  operatorEuReference: z.string().max(120),
  productDescription: z.string().min(1).max(500),
  // EUDR DDS only applies to Annex I commodities; narrow to the regulated
  // set so the type system refuses an extended-catalog commodity here.
  commodity: eudrCommoditySchema,
  hsCode: z.string().regex(/^\d{4,10}$/, 'must be a numeric HS / CN code (4-10 digits)'),
  netMassKg: z.number().positive().optional(),
  volumeM3: z.number().positive().optional(),
  count: z.number().int().positive().optional(),
  countriesOfProduction: z.array(countryCodeSchema).min(1),
  plotReferences: z.array(ddsPlotReferenceSchema).min(1),
  upstreamSuppliers: z.array(ddsSupplierReferenceSchema).default([]),
  downstreamRecipients: z.array(ddsSupplierReferenceSchema).default([]),
  riskAssessmentVersion: z.string().max(40),
  riskLevel: ddsRiskLevelSchema,
  riskMitigationApplied: z.boolean(),
  legalityAttestation: z.object({
    countryLegislationVersions: z.array(z.string().max(80)).default([]),
    notes: z.string().max(4000).optional(),
  }),
  generatedAt: iso8601Schema,
  submittedToTracesAt: iso8601Schema.optional(),
  tracesReferenceNumber: z.string().max(120).optional(),
});
export type Dds = z.infer<typeof ddsSchema>;
