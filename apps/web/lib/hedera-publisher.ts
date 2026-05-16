/**
 * HTTP client for the `services/hedera-publisher` Go service. Used by the
 * web app to commit canonical event payloads onto Hedera's HCS topics.
 *
 * The client fails soft: when the publisher is unreachable or returns a
 * non-2xx, this module returns `null` and logs a warning rather than
 * throwing. Callers (e.g. `registerPlot`) treat the absence of an on-chain
 * commitment as "pending" — the row persists with `on_chain_*` columns
 * null, and a follow-up reconciler walks those rows on a schedule and
 * retries the publish until the commitment lands.
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
 * Submit a canonical event payload to a Hedera Consensus Service topic.
 * If `topicId` is the empty string, the publisher creates a new topic and
 * returns its id alongside the sequence number.
 *
 * Returns the on-chain commitment metadata, or `null` on any failure
 * (network, timeout, non-2xx, malformed response). The caller is expected
 * to treat `null` as a deferred publish, not a hard failure.
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

    const body = (await response.json()) as PublisherResponse;
    if (
      typeof body !== 'object' ||
      body === null ||
      typeof body.topicId !== 'string' ||
      typeof body.consensusTimestamp !== 'string' ||
      typeof body.transactionId !== 'string'
    ) {
      console.warn('[hedera-publisher] malformed response body', { url });
      return null;
    }

    return {
      topicId: body.topicId,
      sequenceNumber: BigInt(body.sequenceNumber),
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
