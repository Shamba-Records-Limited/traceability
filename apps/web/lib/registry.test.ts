import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { attestPlotOnChain, recordBatchOnChain, registryEnabled, uuidToBytes32 } from './registry';

const UUID = '4b6c1f3c-72b1-4b8f-9c4f-1a3d4e5f6a7b';
const PAYLOAD_HASH = 'a'.repeat(64);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('registryEnabled', () => {
  let originalValue: string | undefined;

  beforeEach(() => {
    originalValue = process.env.REGISTRY_CONTRACTS_ENABLED;
  });
  afterEach(() => {
    if (originalValue === undefined) delete process.env.REGISTRY_CONTRACTS_ENABLED;
    else process.env.REGISTRY_CONTRACTS_ENABLED = originalValue;
  });

  it('returns false when unset', () => {
    delete process.env.REGISTRY_CONTRACTS_ENABLED;
    expect(registryEnabled()).toBe(false);
  });

  it.each(['1', 'true', 'TRUE', 'yes', 'on'])('returns true for %s', (val) => {
    process.env.REGISTRY_CONTRACTS_ENABLED = val;
    expect(registryEnabled()).toBe(true);
  });

  it.each(['0', 'false', 'no', 'off', ''])('returns false for %s', (val) => {
    process.env.REGISTRY_CONTRACTS_ENABLED = val;
    expect(registryEnabled()).toBe(false);
  });
});

describe('uuidToBytes32', () => {
  it('strips hyphens, lowercases, and right-pads to 64 chars', () => {
    const result = uuidToBytes32(UUID);
    expect(result).toBe('4b6c1f3c72b14b8f9c4f1a3d4e5f6a7b' + '0'.repeat(32));
    expect(result.length).toBe(64);
  });

  it('throws for malformed UUIDs', () => {
    expect(() => uuidToBytes32('not-a-uuid')).toThrow();
    expect(() => uuidToBytes32('zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz')).toThrow();
  });
});

describe('attestPlotOnChain', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    fetchMock = vi.fn();
    originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    originalEnv = {
      enabled: process.env.REGISTRY_CONTRACTS_ENABLED,
      contractId: process.env.HEDERA_PLOT_REGISTRY_ID,
      url: process.env.HEDERA_PUBLISHER_URL,
    };
    process.env.REGISTRY_CONTRACTS_ENABLED = 'true';
    process.env.HEDERA_PLOT_REGISTRY_ID = '0.0.4000001';
    process.env.HEDERA_PUBLISHER_URL = 'https://publisher.example';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const [k, v] of Object.entries({
      REGISTRY_CONTRACTS_ENABLED: originalEnv.enabled,
      HEDERA_PLOT_REGISTRY_ID: originalEnv.contractId,
      HEDERA_PUBLISHER_URL: originalEnv.url,
    })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('returns null when the registry is disabled', async () => {
    process.env.REGISTRY_CONTRACTS_ENABLED = 'false';
    const result = await attestPlotOnChain({
      plotId: UUID,
      payloadHash: PAYLOAD_HASH,
      geometryGeoJson: { type: 'Point', coordinates: [0, 0] },
    });
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when the contract id is unset', async () => {
    delete process.env.HEDERA_PLOT_REGISTRY_ID;
    const result = await attestPlotOnChain({
      plotId: UUID,
      payloadHash: PAYLOAD_HASH,
      geometryGeoJson: { type: 'Point', coordinates: [0, 0] },
    });
    expect(result).toBeNull();
  });

  it('POSTs to /v1/contracts/execute with the right selector + arg encoding', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        contractId: '0.0.4000001',
        transactionId: 'mock-tx-aaaa',
        consensusTimestamp: '2026-05-19T15:00:00Z',
        gasUsed: 100000,
      }),
    );
    const result = await attestPlotOnChain({
      plotId: UUID,
      payloadHash: PAYLOAD_HASH,
      geometryGeoJson: { type: 'Point', coordinates: [0, 0] },
    });
    expect(result).not.toBeNull();
    expect(result?.contractId).toBe('0.0.4000001');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://publisher.example/v1/contracts/execute');
    const body = JSON.parse(init.body as string);
    expect(body.contractId).toBe('0.0.4000001');
    expect(body.functionSelector).toBe('0xb8efb6cf');
    // 0x + 3 * 64 hex chars (plotId, payloadHash, geometryHash) = 0x + 192 chars.
    expect(body.argsHex).toMatch(/^0x[0-9a-f]{192}$/);
  });

  it('returns null on non-2xx (soft failure)', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 502 }));
    const result = await attestPlotOnChain({
      plotId: UUID,
      payloadHash: PAYLOAD_HASH,
      geometryGeoJson: { type: 'Point', coordinates: [0, 0] },
    });
    expect(result).toBeNull();
  });

  it('returns null on malformed response body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ transactionId: 'no contract id' }));
    const result = await attestPlotOnChain({
      plotId: UUID,
      payloadHash: PAYLOAD_HASH,
      geometryGeoJson: { type: 'Point', coordinates: [0, 0] },
    });
    expect(result).toBeNull();
  });
});

describe('recordBatchOnChain', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    fetchMock = vi.fn();
    originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    originalEnv = {
      enabled: process.env.REGISTRY_CONTRACTS_ENABLED,
      contractId: process.env.HEDERA_BATCH_REGISTRY_ID,
      url: process.env.HEDERA_PUBLISHER_URL,
    };
    process.env.REGISTRY_CONTRACTS_ENABLED = 'true';
    process.env.HEDERA_BATCH_REGISTRY_ID = '0.0.4000002';
    process.env.HEDERA_PUBLISHER_URL = 'https://publisher.example';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    for (const [k, v] of Object.entries({
      REGISTRY_CONTRACTS_ENABLED: originalEnv.enabled,
      HEDERA_BATCH_REGISTRY_ID: originalEnv.contractId,
      HEDERA_PUBLISHER_URL: originalEnv.url,
    })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('encodes a zero-parent batch (offset 0x60, length 0)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        contractId: '0.0.4000002',
        transactionId: 'mock-tx-bbbb',
        consensusTimestamp: '2026-05-19T15:00:00Z',
        gasUsed: 80000,
      }),
    );
    await recordBatchOnChain({ batchId: UUID, payloadHash: PAYLOAD_HASH, parentBatchIds: [] });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.functionSelector).toBe('0xa7eef0bb');
    // Four 32-byte words: batchId + payloadHash + offset(0x60) + length(0).
    expect(body.argsHex).toMatch(/^0x[0-9a-f]{256}$/);
    expect(body.argsHex.slice(2 + 128, 2 + 192)).toBe('0'.repeat(62) + '60');
    expect(body.argsHex.slice(2 + 192)).toBe('0'.repeat(64));
  });

  it('encodes parents as bytes32[] elements appended after the length word', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        contractId: '0.0.4000002',
        transactionId: 'mock-tx-cccc',
        consensusTimestamp: '2026-05-19T15:00:00Z',
        gasUsed: 100000,
      }),
    );
    const parent = '11111111-2222-3333-4444-555555555555';
    await recordBatchOnChain({
      batchId: UUID,
      payloadHash: PAYLOAD_HASH,
      parentBatchIds: [parent],
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    // length word = 1, then one parent element.
    expect(body.argsHex.slice(2 + 192, 2 + 256)).toBe('0'.repeat(63) + '1');
    expect(body.argsHex.slice(2 + 256, 2 + 320)).toBe(
      '11111111222233334444555555555555' + '0'.repeat(32),
    );
  });
});
