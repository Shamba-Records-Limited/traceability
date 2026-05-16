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
 * Raised when a provider could not produce a verdict — network timeout,
 * non-2xx response, malformed body, rate-limited, etc. Bubbled out of
 * `checkPlot` and (deliberately) out of `registerPlot` so the caller
 * refuses to attest a plot it could not actually verify. The form layer
 * surfaces this as "deforestation provider unavailable, please retry".
 *
 * This is fail-closed by design: a silent "no deforestation" verdict
 * during a provider outage would be regulatory poison — better to block
 * registration than to falsely attest.
 */
export class DeforestationProviderUnavailableError extends Error {
  readonly provider: string;

  constructor(provider: string, message: string, cause?: unknown) {
    super(`[${provider}] ${message}`, cause === undefined ? undefined : { cause });
    this.name = 'DeforestationProviderUnavailableError';
    this.provider = provider;
  }
}

/**
 * Mock deforestation provider used in development and CI. Always reports
 * "no deforestation detected" so plot registration flows can be exercised
 * without external network calls. Production deployments MUST switch to a
 * real provider via `DEFORESTATION_PROVIDER`. The provider name is
 * `mock:deforestation` so audit dashboards can flag any decisions written
 * against it.
 */
export class MockDeforestationProvider implements DeforestationProvider {
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

// ---------------------------------------------------------------------------
// Global Forest Watch (GFW) Data API adapter
// ---------------------------------------------------------------------------

/**
 * Default GFW Data API base URL. The Data API hosts UMD/Hansen Global
 * Forest Change loss data among many other datasets and is free to use
 * with a registered API key (header: `x-api-key`).
 */
const DEFAULT_GFW_BASE_URL = 'https://data-api.globalforestwatch.org';

/**
 * Default Hansen Global Forest Change dataset version. We default to
 * `latest` so the adapter follows GFW's annual data refresh without a
 * deploy, but production operators SHOULD pin a specific version (e.g.
 * `v1.11`) via `GFW_DATASET_VERSION` for reproducible audits, then bump
 * deliberately when re-running historic checks.
 */
const DEFAULT_GFW_DATASET_VERSION = 'latest';

/**
 * Canopy density threshold (in percent) at which loss is counted. JRC's
 * EUDR Observatory uses 30%; we match that as the platform default so
 * our verdicts align with the methodology auditors are expected to use.
 */
const DEFAULT_GFW_CANOPY_THRESHOLD_PCT = 30;

const DEFAULT_GFW_TIMEOUT_MS = 15_000;

interface GfwProviderConfig {
  apiKey: string;
  baseUrl: string;
  datasetVersion: string;
  canopyThresholdPct: number;
  timeoutMs: number;
}

interface GfwQueryRow {
  umd_tree_cover_loss__year?: unknown;
  area__ha?: unknown;
}

interface GfwQueryResponse {
  data?: ReadonlyArray<GfwQueryRow>;
}

function readGfwConfig(env: NodeJS.ProcessEnv = process.env): GfwProviderConfig {
  const apiKey = (env.GFW_API_KEY ?? '').trim();
  if (!apiKey) {
    throw new DeforestationProviderUnavailableError(
      'gfw',
      'GFW_API_KEY is not set; refusing to construct the GFW provider. Set DEFORESTATION_PROVIDER=mock for local dev without a key.',
    );
  }
  const baseUrl = (env.GFW_BASE_URL ?? DEFAULT_GFW_BASE_URL).trim().replace(/\/$/, '');
  const datasetVersion = (env.GFW_DATASET_VERSION ?? DEFAULT_GFW_DATASET_VERSION).trim();
  // Compliance-critical config: if an env var is set we trust the operator
  // meant to override the default, so an unparseable value is a bug, not a
  // hint to fall back silently. Throw at construction time so a typo like
  // `GFW_CANOPY_THRESHOLD_PCT=fifty` surfaces immediately instead of
  // quietly changing the verdict policy.
  const canopyThresholdPct = parseEnvInt(
    env.GFW_CANOPY_THRESHOLD_PCT,
    DEFAULT_GFW_CANOPY_THRESHOLD_PCT,
    'GFW_CANOPY_THRESHOLD_PCT',
    { min: 0, max: 100 },
  );
  const timeoutMs = parseEnvInt(
    env.GFW_REQUEST_TIMEOUT_MS,
    DEFAULT_GFW_TIMEOUT_MS,
    'GFW_REQUEST_TIMEOUT_MS',
    {
      min: 1,
    },
  );
  return { apiKey, baseUrl, datasetVersion, canopyThresholdPct, timeoutMs };
}

function parseEnvInt(
  raw: string | undefined,
  fallback: number,
  varName: string,
  bounds: { min: number; max?: number },
): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (
    Number.isNaN(parsed) ||
    parsed < bounds.min ||
    (bounds.max !== undefined && parsed > bounds.max)
  ) {
    const range =
      bounds.max === undefined ? `>= ${bounds.min}` : `between ${bounds.min} and ${bounds.max}`;
    throw new DeforestationProviderUnavailableError(
      'gfw',
      `${varName}=${JSON.stringify(raw)} is not a valid integer ${range}.`,
    );
  }
  return parsed;
}

/**
 * The first calendar year of tree cover loss that disqualifies a plot for a
 * given ISO-8601 cut-off date. Hansen Global Forest Change quantises loss to
 * full calendar years, so a cut-off of `2020-12-31T23:59:59.999Z` maps to
 * year >= 2021. We derive this from the cut-off rather than hard-coding 2021
 * so that any future change to `EUDR_CUT_OFF` (or a caller-supplied override)
 * flows through automatically.
 */
function firstDisqualifyingLossYear(cutOffDate: string): number {
  const parsed = new Date(cutOffDate);
  if (Number.isNaN(parsed.getTime())) {
    throw new DeforestationProviderUnavailableError(
      'gfw',
      `cutOffDate=${JSON.stringify(cutOffDate)} is not a valid ISO-8601 instant`,
    );
  }
  return parsed.getUTCFullYear() + 1;
}

function buildGfwSql(canopyThresholdPct: number, firstDisqualifyingYear: number): string {
  // Field naming matches the GFW Data API's `umd_tree_cover_loss` schema:
  // `umd_tree_cover_loss__year` is the integer loss year, `area__ha` is
  // the loss area in hectares. NO SQL aliases here — the parser reads the
  // dataset's native column names so an alias drift between the SQL and
  // the parser would cause every real GFW request to fail-closed without
  // the tests noticing.
  return [
    'SELECT umd_tree_cover_loss__year, SUM(area__ha) AS area__ha',
    'FROM data',
    `WHERE umd_tree_cover_loss__year >= ${firstDisqualifyingYear}`,
    `AND umd_tree_cover_density_2000__threshold = ${canopyThresholdPct}`,
    'GROUP BY umd_tree_cover_loss__year',
    'ORDER BY umd_tree_cover_loss__year',
  ].join(' ');
}

function parseGfwResponse(raw: unknown): { rows: GfwQueryRow[]; hectaresLost: number } {
  if (raw === null || typeof raw !== 'object') {
    throw new DeforestationProviderUnavailableError('gfw', 'response body is not an object');
  }
  const candidate = raw as GfwQueryResponse;
  const data = candidate.data;
  if (!Array.isArray(data)) {
    // Empty result set is legitimate (no loss); a missing `data` array
    // is not, treat it as malformed.
    throw new DeforestationProviderUnavailableError('gfw', 'response missing `data` array');
  }
  let hectaresLost = 0;
  for (const row of data) {
    if (row === null || typeof row !== 'object') {
      throw new DeforestationProviderUnavailableError('gfw', 'response row is not an object');
    }
    const area = (row as GfwQueryRow).area__ha;
    if (typeof area !== 'number' || !Number.isFinite(area)) {
      throw new DeforestationProviderUnavailableError(
        'gfw',
        'response row missing numeric `area__ha`',
      );
    }
    if (area < 0) {
      throw new DeforestationProviderUnavailableError(
        'gfw',
        'response row reports negative `area__ha`',
      );
    }
    hectaresLost += area;
  }
  return { rows: data as GfwQueryRow[], hectaresLost };
}

export class GfwDeforestationProvider implements DeforestationProvider {
  readonly name = 'gfw:umd_tree_cover_loss';
  readonly version: string;
  private readonly config: GfwProviderConfig;

  constructor(config: GfwProviderConfig) {
    this.config = config;
    this.version = config.datasetVersion;
  }

  async checkPlot(input: CheckPlotInput): Promise<DeforestationCheckResult> {
    const url = `${this.config.baseUrl}/dataset/umd_tree_cover_loss/${encodeURIComponent(this.config.datasetVersion)}/query/json`;
    const cutOffDate = input.cutOffDate ?? EUDR_CUT_OFF;
    const firstDisqualifyingYear = firstDisqualifyingLossYear(cutOffDate);
    const sql = buildGfwSql(this.config.canopyThresholdPct, firstDisqualifyingYear);
    const body = JSON.stringify({ sql, geometry: input.geometry });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.config.apiKey,
          accept: 'application/json',
        },
        body,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new DeforestationProviderUnavailableError(
          'gfw',
          `request timed out after ${this.config.timeoutMs}ms`,
          error,
        );
      }
      throw new DeforestationProviderUnavailableError(
        'gfw',
        `fetch failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new DeforestationProviderUnavailableError(
        'gfw',
        `unexpected HTTP ${response.status} ${response.statusText}`,
      );
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch (error) {
      throw new DeforestationProviderUnavailableError(
        'gfw',
        'response body was not valid JSON',
        error,
      );
    }

    const { rows, hectaresLost } = parseGfwResponse(raw);
    const performedAt = new Date().toISOString();

    // Floor the float at 6 decimal places of hectare precision; GFW
    // returns sub-cm² noise that would otherwise pollute the audit row.
    const hectaresLostRounded = Math.round(hectaresLost * 1_000_000) / 1_000_000;

    return {
      provider: this.name,
      providerVersion: this.version,
      cutOffDate,
      performedAt,
      deforestationDetected: hectaresLostRounded > 0,
      hectaresLostAfterCutOff: hectaresLostRounded,
      notes:
        hectaresLostRounded > 0
          ? `Hansen Global Forest Change reports ${hectaresLostRounded.toFixed(4)} ha of tree cover loss inside this plot since ${firstDisqualifyingYear}-01-01 at the ${this.config.canopyThresholdPct}% canopy threshold.`
          : `No tree cover loss detected inside this plot since ${firstDisqualifyingYear}-01-01 at the ${this.config.canopyThresholdPct}% canopy threshold (Hansen Global Forest Change ${this.config.datasetVersion}).`,
      raw: {
        dataset: 'umd_tree_cover_loss',
        datasetVersion: this.config.datasetVersion,
        canopyThresholdPct: this.config.canopyThresholdPct,
        cutOffDate,
        firstDisqualifyingYear,
        rows,
        country: input.country,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Provider selection
// ---------------------------------------------------------------------------

let cachedProvider: DeforestationProvider | null = null;

/**
 * Resolve the deforestation provider for the current process.
 *
 * Selection is driven by `DEFORESTATION_PROVIDER`:
 *   - `mock` (or unset)  -> {@link MockDeforestationProvider} — local dev / CI.
 *   - `gfw`              -> {@link GfwDeforestationProvider}; requires `GFW_API_KEY`.
 *
 * Any other value falls back to the mock with a warning logged so the
 * misconfiguration is obvious in production traces. The instance is
 * cached for the life of the process; tests reset via
 * {@link resetDeforestationProvider}.
 */
export function getDeforestationProvider(): DeforestationProvider {
  if (cachedProvider) return cachedProvider;
  const choice = (process.env.DEFORESTATION_PROVIDER ?? 'mock').trim().toLowerCase();
  switch (choice) {
    case '':
    case 'mock': {
      cachedProvider = new MockDeforestationProvider();
      return cachedProvider;
    }
    case 'gfw': {
      const config = readGfwConfig();
      cachedProvider = new GfwDeforestationProvider(config);
      return cachedProvider;
    }
    default: {
      console.warn(
        `[deforestation] unknown DEFORESTATION_PROVIDER=${choice}; falling back to mock. Supported values: mock, gfw.`,
      );
      cachedProvider = new MockDeforestationProvider();
      return cachedProvider;
    }
  }
}

/**
 * Test-only hook to clear the cached provider so a fresh `process.env`
 * read happens on the next `getDeforestationProvider()` call. Production
 * code MUST NOT call this — it would race with concurrent requests.
 */
export function resetDeforestationProvider(): void {
  cachedProvider = null;
}
