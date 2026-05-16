/**
 * HTTP client for the `services/did-issuer` Go service. Used by the web app
 * to mint a `did:hedera:<network>:<topicId>` for a freshly-onboarded actor.
 *
 * The client fails soft: when the issuer is unreachable, times out,
 * returns a non-2xx, or returns a malformed body, this module returns
 * `null` and logs a warning rather than throwing. Callers (e.g.
 * `createActorForUser`) treat the absence of a real DID as "still
 * holding the `did:placeholder:` stub" — the actor row persists and a
 * background reconciler that rotates placeholders is **not yet
 * implemented**; pending rows stay on the placeholder until manual
 * intervention or a future reconciler PR.
 *
 * Configurable via:
 *   HEDERA_DID_ISSUER_URL  Base URL of the issuer (default http://localhost:8081).
 *   HEDERA_DID_ISSUER_TIMEOUT_MS  Request timeout in ms (default 30000).
 */

const DEFAULT_TIMEOUT_MS = 30_000;

function issuerBaseURL(): string {
  return process.env.HEDERA_DID_ISSUER_URL || 'http://localhost:8081';
}

function issuerTimeout(): number {
  const raw = process.env.HEDERA_DID_ISSUER_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

export interface MintDidResult {
  did: string;
  topicId: string;
  transactionId: string;
  /**
   * Network consensus timestamp as ISO-8601. Guaranteed parseable by
   * `Date.parse` — the client rejects malformed strings before returning.
   */
  consensusTimestamp: string;
  documentVersion: number;
}

interface IssuerResponse {
  did: string;
  topicId: string;
  transactionId: string;
  consensusTimestamp: string;
  documentVersion: number;
}

export interface MintDidInput {
  actorId: string;
  displayName?: string;
  controllerPublicKeyMultibase?: string;
}

/**
 * Mint a `did:hedera` for the supplied actor. Returns the issuer's response
 * on success, or `null` on any failure (network, timeout, non-2xx, malformed
 * body, unparseable timestamp). The caller is expected to treat `null` as a
 * deferred mint, not a hard failure.
 */
export async function mintDid(input: MintDidInput): Promise<MintDidResult | null> {
  if (!input.actorId) {
    console.warn('[did-issuer] mintDid called without actorId');
    return null;
  }

  const url = `${issuerBaseURL().replace(/\/$/, '')}/v1/dids/mint`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), issuerTimeout());

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        actorId: input.actorId,
        displayName: input.displayName ?? '',
        controllerPublicKeyMultibase: input.controllerPublicKeyMultibase ?? '',
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn('[did-issuer] non-2xx response', { status: response.status, url });
      return null;
    }

    const body = (await response.json()) as IssuerResponse;
    if (
      typeof body !== 'object' ||
      body === null ||
      typeof body.did !== 'string' ||
      typeof body.topicId !== 'string' ||
      typeof body.transactionId !== 'string' ||
      typeof body.consensusTimestamp !== 'string' ||
      typeof body.documentVersion !== 'number'
    ) {
      console.warn('[did-issuer] malformed response body', { url });
      return null;
    }

    if (!Number.isFinite(Date.parse(body.consensusTimestamp))) {
      console.warn('[did-issuer] unparseable consensusTimestamp', {
        url,
        value: body.consensusTimestamp,
      });
      return null;
    }

    if (!body.did.startsWith('did:hedera:')) {
      console.warn('[did-issuer] unexpected DID method', { url, did: body.did });
      return null;
    }

    return {
      did: body.did,
      topicId: body.topicId,
      transactionId: body.transactionId,
      consensusTimestamp: body.consensusTimestamp,
      documentVersion: body.documentVersion,
    };
  } catch (error) {
    console.warn('[did-issuer] mint failed', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
