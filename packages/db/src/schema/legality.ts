import { sql } from 'drizzle-orm';
import { boolean, char, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { actors } from './actors';
import { batches } from './batches';

/**
 * Article 9(1)(i) legality attestation slot. Each row attaches a
 * country-specific legality checklist + attestation to a batch. The
 * actual checklist items live in `payload` (JSONB) — the structure is
 * country-driven and tracked in `docs/compliance/country-legality-matrix.md`.
 *
 * MVP shape: an operator can mark a batch as legally compliant for a
 * given country, attach evidence URIs (IPFS, S3, ...) and a signed
 * statement, with a free-text notes field. The structured per-item
 * checklist UI ships in Phase 2 alongside the legality module proper;
 * this table is the schema slot the UI will fill in.
 */
export const legalityAttestations = pgTable(
  'legality_attestations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => batches.id, { onDelete: 'cascade' }),
    attestedByActorId: uuid('attested_by_actor_id')
      .notNull()
      .references(() => actors.id, { onDelete: 'restrict' }),
    country: char('country', { length: 2 }).notNull(),
    /**
     * Free-form payload following whichever schema the country
     * legality matrix declares (land tenure, labour, tax, customs,
     * anti-corruption, environmental, anti-money-laundering). The
     * structure is intentionally not constrained here so Phase 2
     * can introduce per-country schemas without a migration.
     */
    payload: jsonb('payload').notNull(),
    /** Attached evidence URIs (IPFS / S3 / HTTPS). */
    evidenceUris: text('evidence_uris')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** SHA-256 of canonical payload, committed on the event chain. */
    payloadHash: char('payload_hash', { length: 64 }).notNull(),
    /** Whether the attester is taking on personal liability for the statement. */
    operatorVouches: boolean('operator_vouches').notNull().default(false),
    notes: text('notes'),
    attestedAt: timestamp('attested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('legality_attestations_batch_idx').on(t.batchId),
    index('legality_attestations_country_idx').on(t.country),
  ],
);

export type LegalityAttestationRow = typeof legalityAttestations.$inferSelect;
export type NewLegalityAttestationRow = typeof legalityAttestations.$inferInsert;
