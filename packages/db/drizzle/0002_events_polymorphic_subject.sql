ALTER TABLE "events" ALTER COLUMN "batch_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "plot_id" uuid;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_plot_id_plots_id_fk" FOREIGN KEY ("plot_id") REFERENCES "public"."plots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_plot_idx" ON "events" USING btree ("plot_id");