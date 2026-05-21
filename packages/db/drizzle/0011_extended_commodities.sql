-- Extend the `commodity` enum to cover non-EUDR commodities (major Kenyan
-- agri exports + common cross-border crops). `IF NOT EXISTS` keeps each
-- statement idempotent so partial-apply / re-run scenarios are safe.
--
-- The EUDR pipeline narrows back to the Annex I subset in application
-- code via `eudrCommoditySchema` in `@shamba/shared-types`. Adding a
-- value here does NOT bring it into the regulated path.
ALTER TYPE "public"."commodity" ADD VALUE IF NOT EXISTS 'tea';--> statement-breakpoint
ALTER TYPE "public"."commodity" ADD VALUE IF NOT EXISTS 'avocado';--> statement-breakpoint
ALTER TYPE "public"."commodity" ADD VALUE IF NOT EXISTS 'macadamia';--> statement-breakpoint
ALTER TYPE "public"."commodity" ADD VALUE IF NOT EXISTS 'cashew';--> statement-breakpoint
ALTER TYPE "public"."commodity" ADD VALUE IF NOT EXISTS 'beans';--> statement-breakpoint
ALTER TYPE "public"."commodity" ADD VALUE IF NOT EXISTS 'maize';--> statement-breakpoint
ALTER TYPE "public"."commodity" ADD VALUE IF NOT EXISTS 'sugarcane';--> statement-breakpoint
ALTER TYPE "public"."commodity" ADD VALUE IF NOT EXISTS 'banana';--> statement-breakpoint
ALTER TYPE "public"."commodity" ADD VALUE IF NOT EXISTS 'mango';--> statement-breakpoint
ALTER TYPE "public"."commodity" ADD VALUE IF NOT EXISTS 'flowers';--> statement-breakpoint
ALTER TYPE "public"."commodity" ADD VALUE IF NOT EXISTS 'dairy';--> statement-breakpoint
ALTER TYPE "public"."commodity" ADD VALUE IF NOT EXISTS 'fish';--> statement-breakpoint
ALTER TYPE "public"."commodity" ADD VALUE IF NOT EXISTS 'pyrethrum';--> statement-breakpoint
ALTER TYPE "public"."commodity" ADD VALUE IF NOT EXISTS 'sisal';--> statement-breakpoint
ALTER TYPE "public"."commodity" ADD VALUE IF NOT EXISTS 'cassava';
