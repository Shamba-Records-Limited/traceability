import { sql } from 'drizzle-orm';
import { char, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { actorRoleEnum } from './enums';

/**
 * Single table for every actor regardless of role. Role-specific fields live
 * in the discriminated `roleAttrs` JSONB column to avoid sparse nullable
 * columns; the structure of that JSON is enforced at the application layer
 * by the Zod schemas in `@shamba/shared-types/actor`.
 *
 * `did` is unique because every actor maps 1:1 to a Hedera DID at issuance;
 * this is the foreign key the rest of the schema joins against where it
 * matters that the entity is on-chain-identified.
 */
export const actors = pgTable(
  'actors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    did: text('did').notNull().unique(),
    role: actorRoleEnum('role').notNull(),
    displayName: text('display_name').notNull(),
    country: char('country', { length: 2 }).notNull(),
    subnational: text('subnational'),
    contactEmail: text('contact_email'),
    contactPhone: text('contact_phone'),
    roleAttrs: jsonb('role_attrs')
      .notNull()
      .default(sql`'{}'::jsonb`),
    /**
     * Hedera account id (e.g. `0.0.12345`) that custodies the actor's HTS
     * NFTs and signs transactions emitted on their behalf. Auto-generated
     * by the publisher's `/v1/accounts/create` endpoint at onboarding,
     * but advanced users can replace this with their own existing wallet
     * via `/dashboard/wallet` (which sets `walletProvider` to
     * `user_provided`). Unique because two actors must never share an
     * on-chain custody account.
     */
    hederaAccountId: text('hedera_account_id').unique(),
    /**
     * AES-256-GCM ciphertext of the Hedera private key, base64-encoded.
     * Format: `base64(iv ‖ ciphertext ‖ authTag)`; the KDF derives the
     * encryption key from `AUTH_SECRET` via scrypt with a fixed salt
     * (`shamba-wallet-v1`). See `apps/web/lib/wallet-crypto.ts`. This
     * column is the single source of truth for the at-rest key; the
     * cleartext is surfaced ONCE at onboarding and never retrieved from
     * the DB except when the publisher needs the actor to sign a
     * transaction (in which case the web side decrypts in-process and
     * forwards to the publisher without persisting).
     */
    encryptedPrivateKey: text('encrypted_private_key'),
    /**
     * Provenance of the wallet:
     *   - `system_generated`: created by the publisher's `/v1/accounts/create`
     *     at onboarding; private key is custodied by us (encrypted at rest).
     *   - `user_provided`: pasted by the actor on `/dashboard/wallet`; the
     *     paste flow validates the key by signing a test transaction
     *     before storing.
     * Null is allowed only for backfilled rows from before this column
     * existed; new actors must always have a non-null value. Enforced by
     * application code rather than a DB constraint so legacy rows do not
     * block migrations.
     */
    walletProvider: text('wallet_provider'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * Reconciler lease timestamp. Non-null means a worker is currently
     * attempting to mint and rotate a real did:hedera for this actor.
     * Stops two cron ticks from minting duplicate HCS topics for the
     * same actor's DID document.
     */
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
  },
  (t) => [index('actors_role_idx').on(t.role), index('actors_country_idx').on(t.country)],
);

/**
 * Convenience export for joins; the Zod schema in shared-types/actor.ts is
 * authoritative for runtime validation, this is just the inferred type.
 */
export type ActorRow = typeof actors.$inferSelect;
export type NewActorRow = typeof actors.$inferInsert;
