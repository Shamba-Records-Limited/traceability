-- Auto-generated wallet columns for the onboarding flow that creates a
-- Hedera account on the actor's behalf and stores the private key
-- encrypted at rest. See `apps/web/lib/wallet-crypto.ts` for the KDF
-- + cipher details, and `packages/db/src/schema/actors.ts` for
-- column-level documentation.
--
-- The unique constraint on `hedera_account_id` tolerates multiple
-- NULLs (Postgres semantics), so legacy rows that have not yet been
-- onboarded into the new flow do not block migration.
ALTER TABLE "actors" ADD COLUMN "encrypted_private_key" text;--> statement-breakpoint
ALTER TABLE "actors" ADD COLUMN "wallet_provider" text;--> statement-breakpoint
ALTER TABLE "actors" ADD CONSTRAINT "actors_hedera_account_id_unique" UNIQUE("hedera_account_id");
