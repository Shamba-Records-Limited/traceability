import type { PlotGeometry } from '@shamba/shared-types';

/**
 * EUDR Article 3 cut-off date for deforestation-free claims: 31 December 2020,
 * end-of-day UTC. Anything detected on or after this instant disqualifies the
 * plot. Locked here as a single constant so every provider implementation
 * uses the same boundary.
 */
export const EUDR_CUT_OFF = '2020-12-31T23:59:59.999Z';

/**
 * Outcome of a deforestation check. Mirrors the canonical Zod
 * `deforestationCheckSchema` in `@shamba/shared-types/plot` so consumers can
 * persist the value directly. We don't import that schema here only because
 * shared-types' Zod object includes id/timestamp fields that the provider
 * doesn't generate.
 */
export interface DeforestationCheckResult {
  provider: string;
  providerVersion?: string;
  cutOffDate: string;
  performedAt: string;
  deforestationDetected: boolean;
  hectaresLostAfterCutOff?: number;
  evidenceCid?: string;
  notes?: string;
  /**
   * Provider-native response payload (e.g. raw GFW API JSON) kept opaque
   * for the audit trail. Persisted in `deforestation_checks.raw`.
   */
  raw?: Record<string, unknown>;
}

export interface CheckPlotInput {
  geometry: PlotGeometry;
  country: string;
  /** Optional ISO-8601 floor for the check; defaults to EUDR_CUT_OFF. */
  cutOffDate?: string;
}

export interface DeforestationProvider {
  readonly name: string;
  readonly version: string;
  checkPlot(input: CheckPlotInput): Promise<DeforestationCheckResult>;
}

/**
 * Mock deforestation provider used in development and CI. Always reports
 * "no deforestation detected" so plot registration flows can be exercised
 * without external network calls. The real Global Forest Watch adapter
 * lands in a separate PR behind the same interface; per ADR-0004 the
 * default in production will be GFW until JRC publishes its EUDR maps.
 *
 * Production deployments MUST replace this with a real provider. The
 * provider name is `mock:deforestation` so audit dashboards can flag any
 * decisions written against it.
 */
class MockDeforestationProvider implements DeforestationProvider {
  readonly name = 'mock:deforestation';
  readonly version = '0.1.0';

  async checkPlot(input: CheckPlotInput): Promise<DeforestationCheckResult> {
    return Promise.resolve({
      provider: this.name,
      providerVersion: this.version,
      cutOffDate: input.cutOffDate ?? EUDR_CUT_OFF,
      performedAt: new Date().toISOString(),
      deforestationDetected: false,
      hectaresLostAfterCutOff: 0,
      notes: 'Mock provider: always returns no deforestation. Do not deploy to production.',
      raw: {
        geometryType: input.geometry.type,
        country: input.country,
      },
    });
  }
}

let cachedProvider: DeforestationProvider | null = null;

/**
 * Resolves the deforestation provider for the current process. Today it is
 * always the mock implementation; once the GFW / JRC adapters land they will
 * be selected by `DEFORESTATION_PROVIDER` from the environment (see
 * `.env.example`).
 */
export function getDeforestationProvider(): DeforestationProvider {
  if (cachedProvider) return cachedProvider;
  // TODO: read DEFORESTATION_PROVIDER and dispatch to GFW / JRC / sentinel-hub.
  cachedProvider = new MockDeforestationProvider();
  return cachedProvider;
}
