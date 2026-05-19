/**
 * HTTP client for the publisher's HTS NFT transfer endpoint. Used by the
 * handoff acceptance flow when both the sender and receiver have a
 * Hedera account id on file. Soft-failure: on any error the handoff
 * settles in the off-chain log only; the on-chain transfer is deferred
 * to a follow-up reconciler that we have not built yet.
 */

const DEFAULT_TIMEOUT_MS = 15_000;

function publisherBaseURL(): string {
  return process.env.HEDERA_PUBLISHER_URL || 'http://localhost:8080';
}

function publisherTimeout(): number {
  const raw = process.env.HEDERA_PUBLISHER_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

export interface TransferInput {
  tokenId: string;
  /** HTS serial number; stringified for transport because it can exceed 2^53. */
  serialNumber: string;
  fromAccount: string;
  toAccount: string;
}

export interface TransferResult {
  transactionId: string;
  consensusTimestamp: string;
}

interface RawResponse {
  transactionId: string;
  consensusTimestamp: string;
}

function parseResponse(raw: unknown): RawResponse | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.transactionId !== 'string' ||
    r.transactionId.length === 0 ||
    typeof r.consensusTimestamp !== 'string' ||
    r.consensusTimestamp.length === 0
  ) {
    return null;
  }
  return { transactionId: r.transactionId, consensusTimestamp: r.consensusTimestamp };
}

/**
 * Submit an HTS NFT transfer to the publisher. The publisher's transfer
 * handler expects `serialNumber` as a JSON number, but Go decodes it
 * into `int64`, which is safe up to ~9.2e18 — well above any realistic
 * HTS serial we'd issue. We send it as a number here.
 *
 * Returns `null` on any failure (network/timeout/non-2xx/malformed
 * body). Callers settle the off-chain record regardless.
 */
export async function transferNft(input: TransferInput): Promise<TransferResult | null> {
  const url = `${publisherBaseURL().replace(/\/$/, '')}/v1/batches/transfer`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), publisherTimeout());

  let serial: number;
  try {
    serial = Number(BigInt(input.serialNumber));
    if (!Number.isFinite(serial) || serial <= 0) {
      console.warn('[hedera-transfer] invalid serial after BigInt coercion', {
        serialNumber: input.serialNumber,
      });
      return null;
    }
  } catch {
    console.warn('[hedera-transfer] serial not coercible to BigInt', {
      serialNumber: input.serialNumber,
    });
    return null;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tokenId: input.tokenId,
        serialNumber: serial,
        fromAccount: input.fromAccount,
        toAccount: input.toAccount,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn('[hedera-transfer] non-2xx response', { status: response.status, url });
      return null;
    }
    const raw = (await response.json()) as unknown;
    const body = parseResponse(raw);
    if (!body) {
      console.warn('[hedera-transfer] malformed response body', { url });
      return null;
    }
    return body;
  } catch (error) {
    console.warn('[hedera-transfer] transfer failed', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
