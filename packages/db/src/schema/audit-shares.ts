import { char, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { actors } from './actors';
import { batches } from './batches';

/**
 * Token-gated share links for read-only audit access. An operator
 * mints a share for a specific batch and hands the URL (which carries
 * the cleartext token) to a competent authority, importer, or
 * certifier. Anyone with the link can view the batch's audit trail
 * without authenticating; only the operator can revoke or extend.
 *
 * Storage rules mirror `api_keys`:
 *   - NEVER store the cleartext token. SHA-256 hex goes into
 *     `token_hash`; lookup re-hashes the incoming token.
 *   - `token_prefix` holds the first 12 chars of the cleartext for the
 *     "Recent shares" list so an operator can identify which link is
 *     which without revealing the secret.
 *
 * `expires_at` is required at creation time — there is no "perpetual"
 * share. The default in the UI is 90 days; operators can pick anything
 * between 1 hour and 5 years. `revoked_at` is the operator's "leaked
 * link" lever and is checked immediately at every lookup.
 */
export const auditShares = pgTable(
  'audit_shares',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => batches.id, { onDelete: 'cascade' }),
    operatorActorId: uuid('operator_actor_id')
      .notNull()
      .references(() => actors.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    tokenHash: char('token_hash', { length: 64 }).notNull().unique(),
    tokenPrefix: char('token_prefix', { length: 12 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
    accessCount: text('access_count').notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_shares_batch_idx').on(t.batchId),
    index('audit_shares_operator_idx').on(t.operatorActorId),
  ],
);

export type AuditShareRow = typeof auditShares.$inferSelect;
export type NewAuditShareRow = typeof auditShares.$inferInsert;
