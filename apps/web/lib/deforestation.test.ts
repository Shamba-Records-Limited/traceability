import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PlotGeometry } from '@shamba/shared-types';

import {
  DeforestationProviderUnavailableError,
  EUDR_CUT_OFF,
  GfwDeforestationProvider,
  MockDeforestationProvider,
  getDeforestationProvider,
  resetDeforestationProvider,
} from './deforestation';

const POLYGON: PlotGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [36.8, -1.3],
      [36.9, -1.3],
      [36.9, -1.2],
      [36.8, -1.2],
      [36.8, -1.3],
    ],
  ],
};

const fixedConfig = {
  apiKey: 'test-key-abc123',
  baseUrl: 'https://gfw.example',
  datasetVersion: 'v1.11',
  canopyThresholdPct: 30,
  timeoutMs: 1_000,
};

function buildProvider() {
  return new GfwDeforestationProvider(fixedConfig);
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('MockDeforestationProvider', () => {
  it('always reports no deforestation and tags the result with the mock name', async () => {
    const provider = new MockDeforestationProvider();
    const result = await provider.checkPlot({ geometry: POLYGON, country: 'KE' });
    expect(result.provider).toBe('mock:deforestation');
    expect(result.deforestationDetected).toBe(false);
    expect(result.hectaresLostAfterCutOff).toBe(0);
    expect(result.cutOffDate).toBe(EUDR_CUT_OFF);
  });
});

describe('GfwDeforestationProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    fetchMock = vi.fn();
    originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it('POSTs to the dataset query/json endpoint with API key, SQL, and inline geometry', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));
    const provider = buildProvider();
    await provider.checkPlot({ geometry: POLYGON, country: 'KE' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as [string, RequestInit];
    const [url, init] = call;
    expect(url).toBe('https://gfw.example/dataset/umd_tree_cover_loss/v1.11/query/json');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('test-key-abc123');
    expect(headers['content-type']).toBe('application/json');

    const body = JSON.parse(init.body as string);
    expect(body.geometry).toEqual(POLYGON);
    expect(typeof body.sql).toBe('string');
    expect(body.sql).toMatch(/umd_tree_cover_loss__year >= 2021/);
    expect(body.sql).toMatch(/umd_tree_cover_density_2000__threshold = 30/);
  });

  it('treats an empty data array as "no deforestation detected"', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));
    const provider = buildProvider();
    const result = await provider.checkPlot({ geometry: POLYGON, country: 'KE' });
    expect(result.deforestationDetected).toBe(false);
    expect(result.hectaresLostAfterCutOff).toBe(0);
    expect(result.provider).toBe('gfw:umd_tree_cover_loss');
    expect(result.providerVersion).toBe('v1.11');
    expect(result.cutOffDate).toBe(EUDR_CUT_OFF);
  });

  it('sums area__ha across years and reports deforestation when > 0', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: [
          { umd_tree_cover_loss__year: 2021, area__ha: 0.42 },
          { umd_tree_cover_loss__year: 2022, area__ha: 1.18 },
        ],
      }),
    );
    const provider = buildProvider();
    const result = await provider.checkPlot({ geometry: POLYGON, country: 'KE' });
    expect(result.deforestationDetected).toBe(true);
    expect(result.hectaresLostAfterCutOff).toBeCloseTo(1.6, 6);
    expect((result.raw as { rows: unknown[] }).rows).toHaveLength(2);
  });

  it('throws DeforestationProviderUnavailableError on non-2xx status', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('rate limited', { status: 429, statusText: 'Too Many Requests' }),
    );
    const provider = buildProvider();
    await expect(provider.checkPlot({ geometry: POLYGON, country: 'KE' })).rejects.toBeInstanceOf(
      DeforestationProviderUnavailableError,
    );
  });

  it('throws DeforestationProviderUnavailableError on malformed JSON body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('not json', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const provider = buildProvider();
    await expect(provider.checkPlot({ geometry: POLYGON, country: 'KE' })).rejects.toBeInstanceOf(
      DeforestationProviderUnavailableError,
    );
  });

  it('throws DeforestationProviderUnavailableError when `data` is missing', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'ok' }));
    const provider = buildProvider();
    await expect(provider.checkPlot({ geometry: POLYGON, country: 'KE' })).rejects.toBeInstanceOf(
      DeforestationProviderUnavailableError,
    );
  });

  it('throws DeforestationProviderUnavailableError when a row reports negative area', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ data: [{ umd_tree_cover_loss__year: 2022, area__ha: -1 }] }),
    );
    const provider = buildProvider();
    await expect(provider.checkPlot({ geometry: POLYGON, country: 'KE' })).rejects.toBeInstanceOf(
      DeforestationProviderUnavailableError,
    );
  });

  it('throws DeforestationProviderUnavailableError on fetch network failure', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const provider = buildProvider();
    await expect(provider.checkPlot({ geometry: POLYGON, country: 'KE' })).rejects.toBeInstanceOf(
      DeforestationProviderUnavailableError,
    );
  });

  it('aborts and throws when the request exceeds the configured timeout', async () => {
    // Resolve only after the abort fires so we exercise the AbortError branch.
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_, reject) => {
          const signal = (init as RequestInit | undefined)?.signal;
          signal?.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );
    const provider = new GfwDeforestationProvider({ ...fixedConfig, timeoutMs: 5 });
    await expect(provider.checkPlot({ geometry: POLYGON, country: 'KE' })).rejects.toBeInstanceOf(
      DeforestationProviderUnavailableError,
    );
  });
});

describe('getDeforestationProvider', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    resetDeforestationProvider();
  });

  afterEach(() => {
    process.env = originalEnv;
    resetDeforestationProvider();
  });

  it('returns the mock provider when DEFORESTATION_PROVIDER is unset', () => {
    delete process.env.DEFORESTATION_PROVIDER;
    const provider = getDeforestationProvider();
    expect(provider.name).toBe('mock:deforestation');
  });

  it('returns the mock provider when DEFORESTATION_PROVIDER=mock', () => {
    process.env.DEFORESTATION_PROVIDER = 'mock';
    const provider = getDeforestationProvider();
    expect(provider.name).toBe('mock:deforestation');
  });

  it('returns the GFW provider when DEFORESTATION_PROVIDER=gfw with a key', () => {
    process.env.DEFORESTATION_PROVIDER = 'gfw';
    process.env.GFW_API_KEY = 'test-key-abc123';
    const provider = getDeforestationProvider();
    expect(provider.name).toBe('gfw:umd_tree_cover_loss');
  });

  it('throws when DEFORESTATION_PROVIDER=gfw and GFW_API_KEY is missing', () => {
    process.env.DEFORESTATION_PROVIDER = 'gfw';
    delete process.env.GFW_API_KEY;
    expect(() => getDeforestationProvider()).toThrow(DeforestationProviderUnavailableError);
  });

  it('falls back to mock with a warning for unknown provider values', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    process.env.DEFORESTATION_PROVIDER = 'planet';
    const provider = getDeforestationProvider();
    expect(provider.name).toBe('mock:deforestation');
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it('caches the provider across calls', () => {
    process.env.DEFORESTATION_PROVIDER = 'mock';
    const a = getDeforestationProvider();
    const b = getDeforestationProvider();
    expect(a).toBe(b);
  });
});
