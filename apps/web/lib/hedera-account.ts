/**
 * HTTP client for the publisher's `/v1/accounts/create` endpoint. The
 * web app calls this once per new actor at the end of onboarding to
 * provision a system-managed Hedera wallet. The publisher generates
 * an ECDSA keypair, funds the new account from the operator
 * (defaulting to 10 HBAR), and returns the new account id + private
 * key. The cleartext private key returned here is the ONLY copy that
 * will ever exist outside the Hedera network — `createActorForUser`
 * is expected to encrypt it for at-rest storage and surface it to
 * the end user exactly once.
 *
 * Configurable via the same env vars as the existing publisher
 * clients (`hedera-publisher.ts`, `hedera-transfer.ts`):
 *   HEDERA_PUBLISHER_URL  Base URL of the publisher.
 *   HEDERA_PUBLISHER_TIMEOUT_MS  Request timeout in ms.
 *
 * Failure mode: returns `null` on any error (network, timeout,
 * non-2xx, malformed body). Onboarding is allowed to proceed without
 * a wallet — the dashboard surfaces a "wallet pending" badge and a
 * later attempt can fill it in. We deliberately do NOT crash the
 * onboarding form for a publisher hiccup; the actor row + DID are
 * far more important and shouldn't be held hostage to the publisher.
 */

const DEFAULT_TIMEOUT_MS = 20_000;

function publisherBaseURL(): string {
  return process.env.HEDERA_PUBLISHER_URL || 'http://localhost:8080';
}

function publisherTimeout(): number {
  const raw = process.env.HEDERA_PUBLISHER_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

export interface CreateAccountResult {
  /** Hedera account id, canonical `0.0.<num>` form. */
  accountId: string;
  /** DER-encoded ECDSA public key as a hex string. */
  publicKey: string;
  /**
   * DER-encoded ECDSA private key as a hex string. Cleartext — must
   * be encrypted at rest immediately and surfaced to the actor
   * exactly once.
   */
  privateKey: string;
  /** 0x-prefixed 20-byte EVM address derived from the public key. */
  evmAddress: string;
  /** Hedera transaction id of the account-create transaction. */
  createTransactionId: string;
  /** Initial balance in tinybars, echoed from the publisher request. */
  initialBalance: number;
}

interface RawResponse {
  accountId: string;
  publicKey: string;
  privateKey: string;
  evmAddress: string;
  createTransactionId: string;
  initialBalance: number | string;
}

function parseResponse(raw: unknown): RawResponse | null {
  if (raw === null || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.accountId !== 'string' ||
    typeof r.publicKey !== 'string' ||
    typeof r.privateKey !== 'string' ||
    typeof r.evmAddress !== 'string' ||
    typeof r.createTransactionId !== 'string' ||
    (typeof r.initialBalance !== 'number' && typeof r.initialBalance !== 'string')
  ) {
    return null;
  }
  return {
    accountId: r.accountId,
    publicKey: r.publicKey,
    privateKey: r.privateKey,
    evmAddress: r.evmAddress,
    createTransactionId: r.createTransactionId,
    initialBalance: r.initialBalance as number | string,
  };
}

export interface CreateAccountInput {
  /**
   * Optional human-readable label persisted as the Hedera account memo
   * (publisher truncates to 100 bytes). Used to make the wallet easy
   * to find in mirror-node explorers when an operator needs to
   * support a confused user.
   */
  label?: string;
  /**
   * Optional initial balance override, in tinybars. Defaults to the
   * publisher's own default (10 HBAR) when omitted.
   */
  initialBalanceTinybars?: number;
}

/**
 * Provision a fresh Hedera account via the publisher. Returns the
 * account id + cleartext private key on success, or `null` on any
 * failure. Caller is responsible for encrypting the private key
 * before persisting it.
 */
export async function createHederaAccount(
  input: CreateAccountInput = {},
): Promise<CreateAccountResult | null> {
  const url = `${publisherBaseURL().replace(/\/$/, '')}/v1/accounts/create`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), publisherTimeout());

  try {
    const body: Record<string, unknown> = {};
    if (input.label) body.label = input.label;
    if (typeof input.initialBalanceTinybars === 'number') {
      body.initialBalanceTinybars = input.initialBalanceTinybars;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn('[hedera-account] non-2xx response', {
        status: response.status,
        url,
      });
      return null;
    }

    const raw = (await response.json()) as unknown;
    const parsed = parseResponse(raw);
    if (!parsed) {
      console.warn('[hedera-account] malformed response body', { url });
      return null;
    }

    let balance: number;
    if (typeof parsed.initialBalance === 'number') {
      balance = parsed.initialBalance;
    } else {
      const n = Number.parseInt(parsed.initialBalance, 10);
      if (!Number.isFinite(n)) {
        console.warn('[hedera-account] initialBalance not a number', {
          value: parsed.initialBalance,
        });
        return null;
      }
      balance = n;
    }

    return {
      accountId: parsed.accountId,
      publicKey: parsed.publicKey,
      privateKey: parsed.privateKey,
      evmAddress: parsed.evmAddress,
      createTransactionId: parsed.createTransactionId,
      initialBalance: balance,
    };
  } catch (error) {
    console.warn('[hedera-account] create failed', {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
