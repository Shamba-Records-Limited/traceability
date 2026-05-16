/**
 * HTTP client for the `services/hedera-publisher` Go service. Used by the
 * web app to commit on-chain event commitments to Hedera's HCS topics.
 *
 * Per ADR-0002 + `@shamba/shared-types/event` the **on-chain** payload is an
 * `EventCommitment` carrying the SHA-256 hash of the off-chain canonical
 * payload (and the actor's DID, topic id, etc.). The full payload lives
 * off-chain in `events.payload`; only the commitment goes through this
 * client and lands as the HCS message body. Auditors verify by hashing the
 * off-chain payload and comparing to the on-chain commitment.
 *
 * The client fails soft: when the publisher is unreachable, times out,
 * returns a non-2xx, or returns a malformed body, this module returns
 * `null` and logs a warning rather than throwing. Callers (e.g.
 * `registerPlot`) treat the absence of an on-chain commitment as
 * "pending" — the row persists with `on_chain_*` columns null. A
 * background reconciler that retries pending publishes is **not yet
 * implemented**; pending rows stay pending until manual intervention or
 * a future PR ships the reconciler.
 *
 * Configurable via:
 *   HEDERA_PUBLISHER_URL  Base URL of the publisher (default http://localhost:8080).
 *   HEDERA_PUBLISHER_TIMEOUT_MS  Request timeout in ms (default 10000).
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

export interface PublishEventResult {
  topicId: string;
  sequenceNumber: bigint;
  /**
   * Network consensus timestamp as ISO-8601. Guaranteed parseable by
   * `Date.parse` — the client rejects malformed strings before returning.
   */
  consensusTimestamp: string;
  transactionId: string;
}

interface PublisherResponse {
  topicId: string;
  sequenceNumber: number | string;
  consensusTimestamp: string;
  transactionId: string;
}

/**
 * Validate the publisher's response against the expected shape. Returning a
 * narrowed value (rather than casting `response.json()` directly) means a
 * future maintainer cannot accidentally trust an unverified property —
 * everything below this function works against a real `PublisherResponse`.
 */
function parsePublisherResponse(raw: unknown): PublisherResponse | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.topicId !== 'string' ||
    (typeof r.sequenceNumber !== 'number' && typeof r.sequenceNumber !== 'string') ||
    typeof r.consensusTimestamp !== 'string' ||
    typeof r.transactionId !== 'string'
  ) {
    return null;
  }
  return {
    topicId: r.topicId,
    sequenceNumber: r.sequenceNumber as number | string,
    consensusTimestamp: r.consensusTimestamp,
    transactionId: r.transactionId,
  };
}

/**
 * `Date.parse` is intentionally lenient and accepts strings like `"1/2/2024"`.
 * The publisher service emits RFC 3339 Nano via Go's `time.RFC3339Nano`, so
 * a leading `YYYY-MM-DDTHH:MM:SS` prefix is the right shape to expect.
 * Combine the regex with `Date.parse` to catch both "RFC 3339-shaped but
 * invalid date" and "valid date but wrong format".
 */
function isRfc3339Timestamp(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

/**
 * Submit a `EventCommitment` (or any opaque payload) to a Hedera Consensus
 * Service topic. If `topicId` is the empty string, the publisher creates a
 * new topic and returns its id alongside the sequence number.
 *
 * Returns the on-chain commitment metadata, or `null` on any failure
 * (network, timeout, non-2xx, malformed response, unparseable timestamp).
 * The caller is expected to treat `null` as a deferred publish, not a hard
 * failure.
 */
export async function publishEvent(
  topicId: string,
  payload: unknown,
): Promise<PublishEventResult | null> {
  const url = `${publisherBaseURL().replace(/\/$/, '')}/v1/events`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), publisherTimeout());

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topicId, payload }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn('[hedera-publisher] non-2xx response', {
        status: response.status,
        url,
      });
      return null;
    }

    const raw = (await response.json()) as unknown;
    const body = parsePublisherResponse(raw);
    if (!body) {
      console.warn('[hedera-publisher] malformed response body', { url });
      return null;
    }

    if (!isRfc3339Timestamp(body.consensusTimestamp)) {
      console.warn('[hedera-publisher] unparseable consensusTimestamp', {
        url,
        value: body.consensusTimestamp,
      });
      return null;
    }

    let sequenceNumber: bigint;
    try {
      sequenceNumber = BigInt(body.sequenceNumber);
    } catch {
      console.warn('[hedera-publisher] sequenceNumber not coercible to BigInt', {
        url,
        value: body.sequenceNumber,
      });
      return null;
    }

    return {
      topicId: body.topicId,
      sequenceNumber,
      consensusTimestamp: body.consensusTimestamp,
      transactionId: body.transactionId,
    };
  } catch (error) {
    console.warn('[hedera-publisher] publish failed', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
