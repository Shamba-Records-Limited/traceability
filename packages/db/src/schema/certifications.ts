import { sql } from 'drizzle-orm';
import {
  char,
  date,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { actors } from './actors';
import { batches } from './batches';

/**
 * Closed set of voluntary-scheme certifications the platform recognises
 * at v0.1.0. Adding a new scheme is an ADR-worthy change because each
 * scheme has its own evidence requirements and verifier endpoints; the
 * enum keeps the data model honest about which schemes the dashboards
 * actually know how to render.
 */
export const certificationSchemeEnum = pgEnum('certification_scheme', [
  'fairtrade',
  'rainforest_alliance',
  'organic',
  'utz',
  'cocoa_horizons',
  'gold_standard',
  'iso14001',
  'other',
]);

/**
 * Voluntary-scheme certifications attached to a batch. EUDR Article 9
 * does not directly require these but they materially help an importer
 * with their risk assessment in Article 10, and the consumer-facing QR
 * surface uses them as the human-readable "what is this batch certified
 * to" hooks. Certificate evidence (PDF scans, JSON manifests) lives at
 * `evidence_uri` (IPFS / S3 / HTTPS); the scheme-specific payload lives
 * in `payload` JSONB so we can record scheme details without per-scheme
 * columns.
 *
 * A batch can carry multiple certifications. The `certificate_number`
 * is whatever identifier the scheme issues; uniqueness is
 * scheme-scoped, not platform-scoped (different schemes can reuse the
 * same number).
 */
export const certifications = pgTable(
  'certifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => batches.id, { onDelete: 'cascade' }),
    attestedByActorId: uuid('attested_by_actor_id')
      .notNull()
      .references(() => actors.id, { onDelete: 'restrict' }),
    scheme: certificationSchemeEnum('scheme').notNull(),
    issuer: text('issuer').notNull(),
    certificateNumber: text('certificate_number').notNull(),
    validFrom: date('valid_from').notNull(),
    validUntil: date('valid_until').notNull(),
    evidenceUri: text('evidence_uri'),
    payload: jsonb('payload')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /** SHA-256 over the canonical JSON form of the payload, committed
     * on-chain alongside the `certification_attached` event. */
    payloadHash: char('payload_hash', { length: 64 }).notNull(),
    notes: text('notes'),
    attestedAt: timestamp('attested_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    index('certifications_batch_idx').on(t.batchId),
    index('certifications_scheme_idx').on(t.scheme),
  ],
);

export type CertificationRow = typeof certifications.$inferSelect;
export type NewCertificationRow = typeof certifications.$inferInsert;
