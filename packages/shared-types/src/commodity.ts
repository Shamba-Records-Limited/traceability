import { z } from 'zod';

/**
 * Commodities listed in Annex I of EU Regulation 2023/1115 (EUDR).
 *
 * This set is FROZEN to the seven Annex I commodities and must not be
 * extended without a corresponding regulatory change. Anything that
 * touches the EUDR pipeline (DDS bundles, deforestation-free statements,
 * Article 9 information requirements) MUST narrow to this set so the
 * regulated path is correct by construction.
 *
 * Non-EUDR commodities live in `extendedCommoditySchema` below; the
 * top-level `commoditySchema` is the union of the two and is what the
 * generic platform plumbing (plots, batches, handoffs) accepts.
 */
export const eudrCommoditySchema = z.enum([
  'cattle',
  'cocoa',
  'coffee',
  'oil_palm',
  'rubber',
  'soya',
  'wood',
]);
export type EudrCommodity = z.infer<typeof eudrCommoditySchema>;

/**
 * Non-EUDR commodities the platform supports for traceability outside
 * the EUDR pipeline (e.g. Kenyan agri exports to non-EU markets, or
 * domestic supply chains). Adding to this list is intentionally cheap;
 * adding to {@link eudrCommoditySchema} above is not.
 *
 * Selection criteria for what landed here (May 2026):
 *   - Top Kenyan agri exports by value: tea (~$1.2B/yr), avocado
 *     (~$130M/yr), cut flowers, macadamia, cashew.
 *   - Major staple food crops with cross-border movement: maize,
 *     beans/pulses, sugarcane, banana, mango, cassava.
 *   - Other tracked agri categories: dairy, fish (Lake Victoria and
 *     marine aquaculture), pyrethrum, sisal.
 *
 * `beans` is treated as a category covering pulses broadly (common
 * beans, lentils, chickpeas, peas); per-variety breakdown can be
 * recorded in plot/batch notes when it matters.
 */
export const extendedCommoditySchema = z.enum([
  'tea',
  'avocado',
  'macadamia',
  'cashew',
  'beans',
  'maize',
  'sugarcane',
  'banana',
  'mango',
  'flowers',
  'dairy',
  'fish',
  'pyrethrum',
  'sisal',
  'cassava',
]);
export type ExtendedCommodity = z.infer<typeof extendedCommoditySchema>;

/**
 * All commodities the platform supports. Accepts either an EUDR Annex I
 * commodity or a non-EUDR commodity from the extended catalog.
 *
 * IMPORTANT: code paths that produce a regulated artefact (DDS bundle,
 * EUDR-mode risk classification, etc.) MUST narrow to
 * {@link eudrCommoditySchema} and reject anything else. The generic
 * platform plumbing (plot registration, batch creation, handoffs) uses
 * the union below so non-EUDR supply chains can be traced through the
 * same primitives without polluting the regulated path.
 *
 * Use {@link isEudrRegulated} to gate behaviour at runtime.
 */
export const commoditySchema = z.union([eudrCommoditySchema, extendedCommoditySchema]);
export type Commodity = z.infer<typeof commoditySchema>;

/**
 * Set of EUDR-regulated commodities, materialised for O(1) runtime
 * membership tests. Keep in lock-step with {@link eudrCommoditySchema}.
 */
const EUDR_COMMODITIES: ReadonlySet<EudrCommodity> = new Set(eudrCommoditySchema.options);

/**
 * Type guard: is `c` an EUDR Annex I commodity?
 *
 * Use this to gate any code path that produces a regulated artefact
 * (DDS generation, EUDR risk classification, deforestation-free
 * statement, Article 9 information dossier). The EUDR pipeline must
 * refuse to operate on non-EUDR commodities — this helper is how that
 * refusal stays correct by construction.
 *
 * @example
 *   if (!isEudrRegulated(batch.commodity)) {
 *     throw new Error('DDS can only be generated for EUDR commodities');
 *   }
 */
export function isEudrRegulated(c: Commodity): c is EudrCommodity {
  return EUDR_COMMODITIES.has(c as EudrCommodity);
}

/**
 * Unit of measure used as the default for each commodity when none is
 * specified per-batch. Operators may override per batch via the
 * `unit` field on the batch row.
 *
 * Conventions:
 *   - Live animals: `head`.
 *   - Bulk liquid commodities (dairy, processed oil): `litre`.
 *   - Bulk solid commodities (cocoa, coffee, tea, maize, beans, etc.):
 *     `kg`. Aggregations move to `tonne` at the batch level.
 *   - Timber: `kg` (mass) by default; volume in `m3` is recorded
 *     per-batch where it matters.
 *   - Cut flowers and bananas are commercially traded by stems / bunches
 *     but the platform measures them in kg to keep one canonical unit
 *     and rely on per-batch unit overrides when the exporter wants to
 *     report stems.
 */
export const commodityDefaultUnit: Record<Commodity, 'kg' | 'head' | 'litre'> = {
  // EUDR Annex I
  cattle: 'head',
  cocoa: 'kg',
  coffee: 'kg',
  oil_palm: 'kg',
  rubber: 'kg',
  soya: 'kg',
  wood: 'kg',
  // Extended (non-EUDR)
  tea: 'kg',
  avocado: 'kg',
  macadamia: 'kg',
  cashew: 'kg',
  beans: 'kg',
  maize: 'kg',
  sugarcane: 'kg',
  banana: 'kg',
  mango: 'kg',
  flowers: 'kg',
  dairy: 'litre',
  fish: 'kg',
  pyrethrum: 'kg',
  sisal: 'kg',
  cassava: 'kg',
};

/**
 * Human-readable label for each commodity. Used by every dashboard
 * page that renders a commodity name. Falls back to the raw enum value
 * if a lookup misses (shouldn't happen for well-formed data, but the
 * fallback keeps the UI honest if the catalog ever drifts ahead of
 * the migration).
 */
export const commodityLabel: Record<Commodity, string> = {
  // EUDR Annex I
  cattle: 'Cattle',
  cocoa: 'Cocoa',
  coffee: 'Coffee',
  oil_palm: 'Oil palm',
  rubber: 'Rubber',
  soya: 'Soya',
  wood: 'Wood',
  // Extended (non-EUDR)
  tea: 'Tea',
  avocado: 'Avocado',
  macadamia: 'Macadamia',
  cashew: 'Cashew',
  beans: 'Beans / pulses',
  maize: 'Maize',
  sugarcane: 'Sugarcane',
  banana: 'Banana',
  mango: 'Mango',
  flowers: 'Cut flowers',
  dairy: 'Dairy',
  fish: 'Fish',
  pyrethrum: 'Pyrethrum',
  sisal: 'Sisal',
  cassava: 'Cassava',
};

/**
 * All commodities the platform supports, in catalog order (EUDR Annex I
 * first, then extended). Convenient for rendering dropdowns; the EUDR
 * subset comes first so regulated commodities are visually privileged.
 */
export const allCommodities: ReadonlyArray<Commodity> = [
  ...eudrCommoditySchema.options,
  ...extendedCommoditySchema.options,
];

/**
 * Stage of processing for a given commodity. Used to disambiguate lots of
 * "coffee" that are at very different states in the supply chain (cherry vs
 * parchment vs green vs roasted, for example).
 */
export const processingStageSchema = z.enum([
  'raw',
  'primary_processed',
  'secondary_processed',
  'finished',
]);
export type ProcessingStage = z.infer<typeof processingStageSchema>;
