/**
 * Pure constants for the certification scheme catalogue. Lives in its
 * own module (no DB imports, no Drizzle, no postgres driver) so client
 * components can pull labels + ids without bundling the whole
 * server-side certification module — and the postgres driver with it.
 */

export const CERTIFICATION_SCHEMES = [
  'fairtrade',
  'rainforest_alliance',
  'organic',
  'utz',
  'cocoa_horizons',
  'gold_standard',
  'iso14001',
  'other',
] as const;
export type CertificationScheme = (typeof CERTIFICATION_SCHEMES)[number];

export const CERTIFICATION_SCHEME_LABELS: Record<CertificationScheme, string> = {
  fairtrade: 'Fairtrade',
  rainforest_alliance: 'Rainforest Alliance',
  organic: 'Organic',
  utz: 'UTZ',
  cocoa_horizons: 'Cocoa Horizons',
  gold_standard: 'Gold Standard',
  iso14001: 'ISO 14001',
  other: 'Other',
};
