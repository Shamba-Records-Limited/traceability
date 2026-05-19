import { char, index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { batches } from './batches';

/**
 * Mint-request status. `published` means the publisher returned a
 * minted NFT and the row was stamped onto `batches`; `failed` is
 * reserved for terminal errors a reconciler shouldn't retry (e.g.
 * "operator account is out of HBAR"); `pending` is the default and
 * the only state the reconciler picks up.
 */
export const mintRequestStatusEnum = pgEnum('mint_request_status', [
  'pending',
  'published',
  'failed',
]);

/**
 * Outbox of pending HTS NFT mints. `createBatch` writes a row here
 * inside the same transaction as the batch insert (so the outbox row
 * is durable even if the post-commit mint call never lands), and the
 * reconciler reads from here instead of scanning `batches` for
 * `on_chain_token_id IS NULL`.
 *
 * Idempotency: the publisher dedups by `idempotency_key`. The web
 * service computes that key as `batch:<batchId>:<payloadHash>` so
 * repeated submissions of the same (batch, payload) collapse to a
 * single mint on the publisher side. Even if our retry loop calls
 * the publisher twice, only one NFT lands on-chain.
 *
 * `attempts` + `last_attempt_at` are visibility metadata for an
 * operator dashboard; the reconciler does not use them to throttle
 * (the `claimed_at` lease handles that, mirroring the existing
 * reconciler passes).
 */
export const mintRequests = pgTable(
  'mint_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    batchId: uuid('batch_id')
      .notNull()
      .unique()
      .references(() => batches.id, { onDelete: 'cascade' }),
    /** Computed in the web service: SHA-256 of canonical event payload. */
    payloadHash: char('payload_hash', { length: 64 }).notNull(),
    /** Deterministic key the publisher dedupes on. `batch:<batchId>:<payloadHash>`. */
    idempotencyKey: text('idempotency_key').notNull().unique(),
    status: mintRequestStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    lastError: text('last_error'),
    /** Reconciler lease timestamp (matches the pattern in 0003). */
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
  },
  (t) => [
    index('mint_requests_status_idx').on(t.status),
    index('mint_requests_pending_lease_idx').on(t.claimedAt),
  ],
);

export type MintRequestRow = typeof mintRequests.$inferSelect;
export type NewMintRequestRow = typeof mintRequests.$inferInsert;
