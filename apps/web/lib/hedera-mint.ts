/**
 * HTTP client for the `services/hedera-publisher` Go service's batch-mint
 * endpoint. Used by the web app to mint an HTS NFT representing a batch and
 * (optionally) to mint subsequent serials under the same collection token.
 *
 * Per ADR-0002 each batch is committed on-chain via two artefacts:
 *   1. An HTS NFT carrying compact, append-only metadata (commodity,
 *      processing stage, production window, source plot hashes, lineage
 *      parent hashes). Owned by the custodian, transferred on handoff.
 *   2. An HCS event stream of `EventCommitment` records under the batch's
 *      topic. Handled by `publishEvent` in `./hedera-publisher.ts`.
 *
 * This client covers (1) only.
 *
 * The client fails soft: when the publisher is unreachable, times out,
 * returns a non-2xx, or returns a malformed body, `mintBatchNft` returns
 * `null` and logs a warning rather than throwing. Callers (e.g.
 * `createBatch`) treat the absence of a mint result as "pending" — the
 * `batches` row persists with `on_chain_token_id`, `on_chain_serial_number`,
 * and `on_chain_mint_transaction_id` null. The reconciler in
 * `lib/reconciler.ts` (scheduled via Vercel Cron at `/api/cron/reconcile`)
 * sweeps pending rows on a 5-minute cadence and retries until the mint
 * commitment lands.
 *
 * Configurable via the publisher's existing env vars:
 *   HEDERA_PUBLISHER_URL          Base URL of the publisher (default http://localhost:8080).
 *   HEDERA_PUBLISHER_TIMEOUT_MS   Request timeout in ms (default 10000).
 */

const DEFAULT_TIMEOUT_MS = 10_000;

function publisherBaseURL(): string {
  return process.env.HEDERA_PUBLISHER_URL || 'http://localhost:8080';
}

function publisherTimeout(): number {
  const raw = process.env.HEDERA_PUBLISHER_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

export interface MintBatchInput {
  /**
   * Existing collection token id. Empty string asks the publisher to
   * create a new collection with the supplied `name` / `symbol` and mint
   * the first serial inside it.
   */
  tokenId: string;
  /** Collection name when creating a new token; ignored when `tokenId` is set. */
  name: string;
  /** Collection symbol when creating a new token; ignored when `tokenId` is set. */
  symbol: string;
  /**
   * Per-serial metadata, persisted on-chain as the NFT's metadata bytes.
   * Hedera enforces a hard cap (~100 bytes today); the caller is
   * responsible for keeping this compact — typically a JSON object
   * carrying batch id + payload hash, never the full batch payload.
   */
  metadata: unknown;
}

export interface MintBatchResult {
  tokenId: string;
  serialNumber: bigint;
  transactionId: string;
}

interface MintResponse {
  tokenId: string;
  serialNumber: number | string;
  transactionId: string;
}

/**
 * Validate the publisher's response against the expected shape. Returning
 * a narrowed value (rather than casting `response.json()` directly) means
 * a future maintainer cannot accidentally trust an unverified property —
 * everything below this function works against a real `MintResponse`.
 */
function parseMintResponse(raw: unknown): MintResponse | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.tokenId !== 'string' ||
    r.tokenId.length === 0 ||
    (typeof r.serialNumber !== 'number' && typeof r.serialNumber !== 'string') ||
    typeof r.transactionId !== 'string' ||
    r.transactionId.length === 0
  ) {
    return null;
  }
  return {
    tokenId: r.tokenId,
    serialNumber: r.serialNumber as number | string,
    transactionId: r.transactionId,
  };
}

/**
 * Mint an HTS NFT for a batch. When `input.tokenId === ''` the publisher
 * creates a new collection under the supplied `name`/`symbol` and mints
 * the first serial inside it; otherwise the next serial is minted under
 * the existing collection.
 *
 * Returns the on-chain mint metadata, or `null` on any failure (network,
 * timeout, non-2xx, malformed response, serial-number not coercible to
 * BigInt). The caller is expected to treat `null` as a deferred mint, not
 * a hard failure — the row stays in `draft` status and the reconciler
 * retries on the cron schedule.
 */
export async function mintBatchNft(input: MintBatchInput): Promise<MintBatchResult | null> {
  const url = `${publisherBaseURL().replace(/\/$/, '')}/v1/batches/mint`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), publisherTimeout());

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn('[hedera-mint] non-2xx response', {
        status: response.status,
        url,
      });
      return null;
    }

    const raw = (await response.json()) as unknown;
    const body = parseMintResponse(raw);
    if (!body) {
      console.warn('[hedera-mint] malformed response body', { url });
      return null;
    }

    let serialNumber: bigint;
    try {
      serialNumber = BigInt(body.serialNumber);
    } catch {
      console.warn('[hedera-mint] serialNumber not coercible to BigInt', {
        url,
        value: body.serialNumber,
      });
      return null;
    }
    if (serialNumber <= 0n) {
      console.warn('[hedera-mint] non-positive serialNumber', { url, value: body.serialNumber });
      return null;
    }

    return {
      tokenId: body.tokenId,
      serialNumber,
      transactionId: body.transactionId,
    };
  } catch (error) {
    console.warn('[hedera-mint] mint failed', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
