import { z } from 'zod';

import { countryCodeSchema, iso8601Schema, uuidSchema } from './common.js';
import { didSchema } from './identity.js';

/**
 * Roles an actor can play in the chain of custody. An actor may have more
 * than one role over time (a cooperative can act as a processor for its
 * members, for example), but each actor record fixes a single primary role.
 */
export const actorRoleSchema = z.enum([
  'farmer',
  'cooperative',
  'processor',
  'exporter',
  'importer',
  'auditor',
  'competent_authority',
]);
export type ActorRole = z.infer<typeof actorRoleSchema>;

/**
 * Common fields for every actor regardless of role.
 */
const actorBaseSchema = z.object({
  id: uuidSchema,
  did: didSchema,
  role: actorRoleSchema,
  displayName: z.string().min(1).max(200),
  country: countryCodeSchema,
  subnational: z.string().max(200).optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().max(40).optional(),
  createdAt: iso8601Schema,
  updatedAt: iso8601Schema,
});

export const farmerSchema = actorBaseSchema.extend({
  role: z.literal('farmer'),
  givenName: z.string().min(1).max(120).optional(),
  familyName: z.string().min(1).max(120).optional(),
  nationalIdHash: z.string().optional(),
});
export type Farmer = z.infer<typeof farmerSchema>;

export const cooperativeSchema = actorBaseSchema.extend({
  role: z.literal('cooperative'),
  legalName: z.string().min(1).max(200),
  registrationNumber: z.string().max(120).optional(),
  memberCount: z.number().int().nonnegative().optional(),
});
export type Cooperative = z.infer<typeof cooperativeSchema>;

export const processorSchema = actorBaseSchema.extend({
  role: z.literal('processor'),
  legalName: z.string().min(1).max(200),
  registrationNumber: z.string().max(120).optional(),
  processingStages: z.array(z.string()).default([]),
});
export type Processor = z.infer<typeof processorSchema>;

export const exporterSchema = actorBaseSchema.extend({
  role: z.literal('exporter'),
  legalName: z.string().min(1).max(200),
  registrationNumber: z.string().max(120),
  euOperatorReference: z.string().max(120).optional(),
});
export type Exporter = z.infer<typeof exporterSchema>;

export const importerSchema = actorBaseSchema.extend({
  role: z.literal('importer'),
  legalName: z.string().min(1).max(200),
  euOperatorReference: z.string().max(120),
  vatNumber: z.string().max(40).optional(),
});
export type Importer = z.infer<typeof importerSchema>;

export const auditorSchema = actorBaseSchema.extend({
  role: z.literal('auditor'),
  legalName: z.string().min(1).max(200),
  accreditationBody: z.string().max(200).optional(),
  accreditationReference: z.string().max(120).optional(),
});
export type Auditor = z.infer<typeof auditorSchema>;

export const competentAuthoritySchema = actorBaseSchema.extend({
  role: z.literal('competent_authority'),
  legalName: z.string().min(1).max(200),
  jurisdiction: z.string().max(200),
});
export type CompetentAuthority = z.infer<typeof competentAuthoritySchema>;

export const actorSchema = z.discriminatedUnion('role', [
  farmerSchema,
  cooperativeSchema,
  processorSchema,
  exporterSchema,
  importerSchema,
  auditorSchema,
  competentAuthoritySchema,
]);
export type Actor = z.infer<typeof actorSchema>;
