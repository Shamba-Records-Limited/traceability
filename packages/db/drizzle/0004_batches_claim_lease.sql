ALTER TABLE "batches" ADD COLUMN "on_chain_mint_transaction_id" text;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "claimed_at" timestamp with time zone;