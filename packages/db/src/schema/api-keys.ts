import { sql } from 'drizzle-orm';
import { char, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { actors } from './actors';

/**
 * API keys for external systems integrating with the platform. A key is
 * minted under a specific actor and inherits that actor's data scope —
 * a cooperative's key sees only that cooperative's plots/batches/events.
 *
 * Storage rules:
 *   - We NEVER store the key itself; only `keyHash` (SHA-256 hex of the
 *     full key) is persisted. Auth lookup re-hashes the incoming bearer
 *     token and compares.
 *   - `prefix` keeps the first 12 chars of the cleartext key (matching
 *     the CHAR(12) column type) for display in dashboards so an
 *     operator can identify which key is which without revealing the
 *     secret. 12 was chosen because it includes the constant
 *     `sk_shamba_` namespace (10 chars) plus 2 chars of the random
 *     tail, which is enough for visual identification while leaking
 *     negligible entropy.
 *   - `scopes` is an array of OAuth-style scope strings (e.g.
 *     `plots:read`, `batches:read`). At least one scope is required at
 *     creation time. The application enforces scope checks on every
 *     endpoint.
 *
 * `revokedAt` is set when an operator revokes a key from the dashboard.
 * The auth resolver MUST treat a non-null `revokedAt` as immediate
 * invalidation (no grace period — revocation is the operator's
 * "credentials leaked" lever).
 */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => actors.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    keyHash: char('key_hash', { length: 64 }).notNull().unique(),
    prefix: char('prefix', { length: 12 }).notNull(),
    scopes: text('scopes')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('api_keys_actor_idx').on(t.actorId),
    index('api_keys_active_idx')
      .on(t.actorId, t.revokedAt)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);

export type ApiKeyRow = typeof apiKeys.$inferSelect;
export type NewApiKeyRow = typeof apiKeys.$inferInsert;
