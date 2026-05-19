import { createHash, randomBytes } from 'node:crypto';

const TOKEN_PREFIX = 'audit_';
const TOKEN_RANDOM_BYTES = 32;
const STORED_PREFIX_LENGTH = 12;

export interface GeneratedShareToken {
  /** Cleartext token to embed in the share URL. Display ONCE. */
  cleartext: string;
  /** First 12 chars of the cleartext, persisted for the dashboard list. */
  prefix: string;
  /** SHA-256 hex of the cleartext; matches `audit_shares.token_hash`. */
  tokenHash: string;
}

/**
 * Generate a share token. Cleartext shape is `audit_<64-hex-chars>` so
 * leaked tokens are recognisable to secret scanners and unambiguous in
 * logs. Conceptually parallel to the API-key generator (`api-key-crypto.ts`).
 */
export function generateShareToken(): GeneratedShareToken {
  const random = randomBytes(TOKEN_RANDOM_BYTES).toString('hex');
  const cleartext = `${TOKEN_PREFIX}${random}`;
  return {
    cleartext,
    prefix: cleartext.slice(0, STORED_PREFIX_LENGTH),
    tokenHash: hashShareToken(cleartext),
  };
}

export function hashShareToken(cleartext: string): string {
  return createHash('sha256').update(cleartext, 'utf8').digest('hex');
}

export function looksLikeShareToken(value: string): boolean {
  return /^audit_[0-9a-f]{64}$/.test(value);
}
