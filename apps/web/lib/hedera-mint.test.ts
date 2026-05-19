import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mintBatchNft } from './hedera-mint';

const VALID_INPUT = {
  tokenId: '',
  name: 'Shamba Batch 1',
  symbol: 'SHAMBA-BATCH',
  metadata: { batchId: 'b-1', payloadHash: 'a'.repeat(64) },
};

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('mintBatchNft', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    fetchMock = vi.fn();
    originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    process.env.HEDERA_PUBLISHER_URL = 'https://publisher.example';
    delete process.env.HEDERA_PUBLISHER_TIMEOUT_MS;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('POSTs to /v1/batches/mint with the supplied tokenId, name, symbol, metadata', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ tokenId: '0.0.2000001', serialNumber: 1, transactionId: 'mock-tx-aaaa' }),
    );

    const result = await mintBatchNft(VALID_INPUT);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://publisher.example/v1/batches/mint');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual(VALID_INPUT);
    expect(result).not.toBeNull();
    expect(result?.tokenId).toBe('0.0.2000001');
    expect(result?.serialNumber).toBe(1n);
    expect(result?.transactionId).toBe('mock-tx-aaaa');
  });

  it('coerces a string serialNumber via BigInt (publisher may JSON-encode large serials as strings)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        tokenId: '0.0.2000001',
        serialNumber: '9007199254740993',
        transactionId: 'mock-tx-bbbb',
      }),
    );

    const result = await mintBatchNft(VALID_INPUT);
    expect(result?.serialNumber).toBe(9007199254740993n);
  });

  it('returns null on non-2xx (soft failure)', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('boom', { status: 502, statusText: 'Bad Gateway' }),
    );
    const result = await mintBatchNft(VALID_INPUT);
    expect(result).toBeNull();
  });

  it('returns null on malformed JSON', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not json', { status: 200 }));
    const result = await mintBatchNft(VALID_INPUT);
    expect(result).toBeNull();
  });

  it('returns null when the response is missing tokenId', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ serialNumber: 1, transactionId: 'mock-tx-cccc' }),
    );
    const result = await mintBatchNft(VALID_INPUT);
    expect(result).toBeNull();
  });

  it('returns null when serialNumber is not coercible to BigInt', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ tokenId: '0.0.2', serialNumber: 'not-a-number', transactionId: 'mock-tx-d' }),
    );
    const result = await mintBatchNft(VALID_INPUT);
    expect(result).toBeNull();
  });

  it('returns null when serialNumber is zero or negative', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ tokenId: '0.0.2', serialNumber: 0, transactionId: 'mock-tx-e' }),
    );
    const result = await mintBatchNft(VALID_INPUT);
    expect(result).toBeNull();
  });

  it('returns null on fetch failure (timeout, network)', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    const result = await mintBatchNft(VALID_INPUT);
    expect(result).toBeNull();
  });
});
