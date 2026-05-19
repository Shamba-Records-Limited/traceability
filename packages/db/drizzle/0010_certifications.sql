CREATE TYPE "public"."certification_scheme" AS ENUM('fairtrade', 'rainforest_alliance', 'organic', 'utz', 'cocoa_horizons', 'gold_standard', 'iso14001', 'other');--> statement-breakpoint
CREATE TABLE "certifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"attested_by_actor_id" uuid NOT NULL,
	"scheme" "certification_scheme" NOT NULL,
	"issuer" text NOT NULL,
	"certificate_number" text NOT NULL,
	"valid_from" date NOT NULL,
	"valid_until" date NOT NULL,
	"evidence_uri" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payload_hash" char(64) NOT NULL,
	"notes" text,
	"attested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_attested_by_actor_id_actors_id_fk" FOREIGN KEY ("attested_by_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "certifications_batch_idx" ON "certifications" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "certifications_scheme_idx" ON "certifications" USING btree ("scheme");