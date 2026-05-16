-- Enable PostGIS in the target database. The PostGIS docker image ships with
-- the extension pre-loaded into template1, but managed services (Neon, Supabase,
-- RDS) require this statement on a per-database basis. Idempotent.
CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE TYPE "public"."actor_role" AS ENUM('farmer', 'cooperative', 'processor', 'exporter', 'importer', 'auditor', 'competent_authority');--> statement-breakpoint
CREATE TYPE "public"."batch_status" AS ENUM('draft', 'active', 'consumed', 'exhausted', 'voided');--> statement-breakpoint
CREATE TYPE "public"."batch_unit" AS ENUM('kg', 'head', 'tonne', 'm3');--> statement-breakpoint
CREATE TYPE "public"."commodity" AS ENUM('cattle', 'cocoa', 'coffee', 'oil_palm', 'rubber', 'soya', 'wood');--> statement-breakpoint
CREATE TYPE "public"."event_type" AS ENUM('batch_created', 'plot_attested', 'sample_recorded', 'certification_attached', 'handoff_proposed', 'handoff_dispatched', 'handoff_received', 'batch_split', 'batch_merged', 'batch_exported', 'batch_imported', 'dds_issued', 'dds_accepted', 'batch_voided');--> statement-breakpoint
CREATE TYPE "public"."handoff_status" AS ENUM('proposed', 'in_transit', 'pending_receipt', 'received', 'disputed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."processing_stage" AS ENUM('raw', 'primary_processed', 'secondary_processed', 'finished');--> statement-breakpoint
CREATE TABLE "actors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"did" text NOT NULL,
	"role" "actor_role" NOT NULL,
	"display_name" text NOT NULL,
	"country" char(2) NOT NULL,
	"subnational" text,
	"contact_email" text,
	"contact_phone" text,
	"role_attrs" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "actors_did_unique" UNIQUE("did")
);
--> statement-breakpoint
CREATE TABLE "deforestation_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plot_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_version" text,
	"cut_off_date" timestamp with time zone NOT NULL,
	"performed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deforestation_detected" boolean NOT NULL,
	"hectares_lost_after_cut_off" double precision,
	"evidence_cid" text,
	"notes" text,
	"raw" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "plots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_actor_id" uuid NOT NULL,
	"country" char(2) NOT NULL,
	"subnational" text,
	"commodities" "commodity"[] NOT NULL,
	"geometry" geography(GEOMETRY, 4326) NOT NULL,
	"area_hectares" double precision NOT NULL,
	"on_chain_commitment_topic_id" text,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batch_parents" (
	"child_batch_id" uuid NOT NULL,
	"parent_batch_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batch_plots" (
	"batch_id" uuid NOT NULL,
	"plot_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"commodity" "commodity" NOT NULL,
	"processing_stage" "processing_stage" NOT NULL,
	"unit" "batch_unit" NOT NULL,
	"quantity" double precision NOT NULL,
	"production_start" timestamp with time zone NOT NULL,
	"production_end" timestamp with time zone NOT NULL,
	"custodian_actor_id" uuid NOT NULL,
	"on_chain_topic_id" text,
	"on_chain_token_id" text,
	"on_chain_serial_number" bigint,
	"status" "batch_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"from_actor_id" uuid NOT NULL,
	"to_actor_id" uuid NOT NULL,
	"status" "handoff_status" DEFAULT 'proposed' NOT NULL,
	"quantity" double precision NOT NULL,
	"unit" "batch_unit" NOT NULL,
	"notes" text,
	"proposed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"from_signature_hash" char(64),
	"to_signature_hash" char(64),
	"escrow_contract_address" text,
	"escrow_released" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"type" "event_type" NOT NULL,
	"emitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"emitted_by_did" text NOT NULL,
	"payload" jsonb NOT NULL,
	"payload_hash" char(64) NOT NULL,
	"payload_cid" text,
	"on_chain_topic_id" text,
	"on_chain_sequence_number" bigint,
	"on_chain_consensus_timestamp" timestamp with time zone,
	"on_chain_transaction_id" text
);
--> statement-breakpoint
ALTER TABLE "deforestation_checks" ADD CONSTRAINT "deforestation_checks_plot_id_plots_id_fk" FOREIGN KEY ("plot_id") REFERENCES "public"."plots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plots" ADD CONSTRAINT "plots_owner_actor_id_actors_id_fk" FOREIGN KEY ("owner_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_custodian_actor_id_actors_id_fk" FOREIGN KEY ("custodian_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_from_actor_id_actors_id_fk" FOREIGN KEY ("from_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_to_actor_id_actors_id_fk" FOREIGN KEY ("to_actor_id") REFERENCES "public"."actors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actors_role_idx" ON "actors" USING btree ("role");--> statement-breakpoint
CREATE INDEX "actors_country_idx" ON "actors" USING btree ("country");--> statement-breakpoint
CREATE INDEX "deforestation_checks_plot_idx" ON "deforestation_checks" USING btree ("plot_id");--> statement-breakpoint
CREATE INDEX "plots_owner_idx" ON "plots" USING btree ("owner_actor_id");--> statement-breakpoint
CREATE INDEX "plots_country_idx" ON "plots" USING btree ("country");--> statement-breakpoint
CREATE INDEX "plots_geometry_gix" ON "plots" USING gist ("geometry");--> statement-breakpoint
CREATE INDEX "batch_parents_child_idx" ON "batch_parents" USING btree ("child_batch_id");--> statement-breakpoint
CREATE INDEX "batch_parents_parent_idx" ON "batch_parents" USING btree ("parent_batch_id");--> statement-breakpoint
CREATE INDEX "batch_plots_batch_idx" ON "batch_plots" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "batch_plots_plot_idx" ON "batch_plots" USING btree ("plot_id");--> statement-breakpoint
CREATE INDEX "batches_commodity_idx" ON "batches" USING btree ("commodity");--> statement-breakpoint
CREATE INDEX "batches_custodian_idx" ON "batches" USING btree ("custodian_actor_id");--> statement-breakpoint
CREATE INDEX "batches_status_idx" ON "batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "batches_token_idx" ON "batches" USING btree ("on_chain_token_id","on_chain_serial_number");--> statement-breakpoint
CREATE INDEX "handoffs_batch_idx" ON "handoffs" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "handoffs_from_idx" ON "handoffs" USING btree ("from_actor_id");--> statement-breakpoint
CREATE INDEX "handoffs_to_idx" ON "handoffs" USING btree ("to_actor_id");--> statement-breakpoint
CREATE INDEX "handoffs_status_idx" ON "handoffs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "events_batch_idx" ON "events" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "events_type_idx" ON "events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "events_emitted_at_idx" ON "events" USING btree ("emitted_at");--> statement-breakpoint
CREATE INDEX "events_topic_seq_idx" ON "events" USING btree ("on_chain_topic_id","on_chain_sequence_number");