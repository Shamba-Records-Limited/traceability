ALTER TABLE "actors" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "claimed_at" timestamp with time zone;