CREATE TABLE "audit_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"operator_actor_id" uuid NOT NULL,
	"label" text NOT NULL,
	"token_hash" char(64) NOT NULL,
	"token_prefix" char(12) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_accessed_at" timestamp with time zone,
	"access_count" text DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_shares_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "audit_shares" ADD CONSTRAINT "audit_shares_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_shares" ADD CONSTRAINT "audit_shares_operator_actor_id_actors_id_fk" FOREIGN KEY ("operator_actor_id") REFERENCES "public"."actors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_shares_batch_idx" ON "audit_shares" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "audit_shares_operator_idx" ON "audit_shares" USING btree ("operator_actor_id");