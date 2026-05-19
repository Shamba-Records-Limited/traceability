CREATE TYPE "public"."mint_request_status" AS ENUM('pending', 'published', 'failed');--> statement-breakpoint
CREATE TABLE "mint_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"payload_hash" char(64) NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" "mint_request_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_error" text,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	CONSTRAINT "mint_requests_batch_id_unique" UNIQUE("batch_id"),
	CONSTRAINT "mint_requests_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "legality_attestations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"attested_by_actor_id" uuid NOT NULL,
	"country" char(2) NOT NULL,
	"payload" jsonb NOT NULL,
	"evidence_uris" text[] DEFAULT '{}'::text[] NOT NULL,
	"payload_hash" char(64) NOT NULL,
	"operator_vouches" boolean DEFAULT false NOT NULL,
	"notes" text,
	"attested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mint_requests" ADD CONSTRAINT "mint_requests_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legality_attestations" ADD CONSTRAINT "legality_attestations_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legality_attestations" ADD CONSTRAINT "legality_attestations_attested_by_actor_id_actors_id_fk" FOREIGN KEY ("attested_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mint_requests_status_idx" ON "mint_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mint_requests_pending_lease_idx" ON "mint_requests" USING btree ("claimed_at");--> statement-breakpoint
CREATE INDEX "legality_attestations_batch_idx" ON "legality_attestations" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "legality_attestations_country_idx" ON "legality_attestations" USING btree ("country");