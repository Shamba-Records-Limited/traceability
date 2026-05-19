import { createHash, randomBytes } from 'node:crypto';

/**
 * API key cleartext convention: a constant human-readable prefix plus a
 * random hex tail. The prefix makes leaked keys recognisable to scanners
 * (gitleaks, GitHub's secret scanning) and identifiable when pasted into
 * logs. The hex tail is 32 bytes of entropy.
 */
const KEY_PREFIX = 'sk_shamba_';
const KEY_RANDOM_BYTES = 32;
/** First N chars of the cleartext key persisted in `api_keys.prefix` for UI. */
const STORED_PREFIX_LENGTH = 12;

export interface GeneratedKey {
  /** The cleartext key. Show ONCE to the user, never persist. */
  cleartext: string;
  /** First 12 chars of the cleartext, persisted for display. */
  prefix: string;
  /** SHA-256 hex of the cleartext, persisted for lookup. */
  keyHash: string;
}

/**
 * Generate a new API key. Returns the cleartext (display once), the
 * prefix that is safe to persist for UI listing, and the SHA-256 hash
 * that goes into the DB. The cleartext follows the convention
 * `sk_shamba_<64-hex-chars>`.
 */
export function generateApiKey(): GeneratedKey {
  const random = randomBytes(KEY_RANDOM_BYTES).toString('hex');
  const cleartext = `${KEY_PREFIX}${random}`;
  const prefix = cleartext.slice(0, STORED_PREFIX_LENGTH);
  const keyHash = hashApiKey(cleartext);
  return { cleartext, prefix, keyHash };
}

/**
 * SHA-256 of the cleartext key, hex-encoded. Length is fixed at 64
 * characters; matches `api_keys.key_hash CHAR(64)` exactly.
 */
export function hashApiKey(cleartext: string): string {
  return createHash('sha256').update(cleartext, 'utf8').digest('hex');
}

/**
 * True iff `cleartext` is shaped like a Shamba API key. Used by the
 * resolver to reject obviously-wrong tokens before paying for a DB
 * lookup. NOT a security boundary — a token that passes this check
 * still needs to be hashed and compared against `api_keys.key_hash`.
 */
export function looksLikeApiKey(cleartext: string): boolean {
  return /^sk_shamba_[0-9a-f]{64}$/.test(cleartext);
}
