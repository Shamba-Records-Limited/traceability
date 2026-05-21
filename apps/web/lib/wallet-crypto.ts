import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Symmetric encryption for actor Hedera private keys at rest.
 *
 * The threat model is database-leakage, not insider compromise: an
 * attacker who reads `actors.encrypted_private_key` from a leaked
 * backup must not be able to recover the cleartext key without also
 * stealing the runtime `AUTH_SECRET`. Two separate-secret design is
 * out of scope for the MVP; if/when we move to a KMS we'll switch
 * the KDF input from `AUTH_SECRET` to a KMS-issued data key.
 *
 * Cipher choice: AES-256-GCM. Authenticated, NIST-blessed, hardware-
 * accelerated on every host we target, and matches the API key crypto
 * already in use in `audit-share-crypto.ts` (consistency reduces the
 * audit surface).
 *
 * KDF: scrypt(AUTH_SECRET, "shamba-wallet-v1", 32). Fixed salt is
 * acceptable here because:
 *   1. The secret being stretched (`AUTH_SECRET`) is itself >=32 bytes
 *      of high-entropy random material in production; we're not
 *      defending against weak passwords.
 *   2. The salt's role here is domain separation — preventing a
 *      cipher key derived for wallets from colliding with one
 *      derived for other Shamba subsystems that also use
 *      `AUTH_SECRET` as a KDF source.
 * The salt string carries a `-v1` suffix so a future KDF rotation
 * (e.g. moving to KMS) can run side-by-side without colliding.
 *
 * Wire format: base64(iv ‖ ciphertext ‖ tag).
 *   - iv: 12 random bytes (GCM canonical IV length; longer IVs reduce
 *     birthday-bound safety).
 *   - ciphertext: same length as cleartext.
 *   - tag: 16 bytes (GCM canonical auth-tag length).
 * The decryptor splits on fixed offsets; no length prefixes are needed
 * because IV and tag are fixed-size.
 */

const KDF_SALT = 'shamba-wallet-v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ALGORITHM = 'aes-256-gcm';

/**
 * Derive the cipher key from `AUTH_SECRET`. Re-derived on every call;
 * `scryptSync` is cheap at the parameter set we use (N=16384 by
 * default) and caching adds memory-residency risk for marginal CPU
 * savings.
 *
 * Throws if `AUTH_SECRET` is missing or empty — refusing to operate
 * without a real secret is the correct posture (vs. falling back to
 * a hard-coded one, which would silently weaken the at-rest
 * protection).
 */
function deriveKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('wallet-crypto: AUTH_SECRET must be set; refusing to encrypt with no secret');
  }
  return scryptSync(secret, KDF_SALT, KEY_BYTES);
}

/**
 * Encrypt a Hedera private key (or any utf-8 cleartext) for at-rest
 * storage. Returns a base64-encoded `iv ‖ ciphertext ‖ tag` blob
 * suitable for storage in a `text` column.
 *
 * The cleartext is read as utf-8 because Hedera private keys are
 * exchanged as DER-encoded hex strings; binary input is also fine —
 * the function never inspects the payload.
 */
export function encryptPrivateKey(plaintext: string): string {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('wallet-crypto: plaintext must be a non-empty string');
  }
  const key = deriveKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ciphertext, tag]).toString('base64');
}

/**
 * Reverse of `encryptPrivateKey`. Returns the original utf-8 cleartext
 * on success. Throws on any tampering — GCM's auth tag is verified by
 * `decipher.final()`, which raises `Unsupported state or unable to
 * authenticate data` when the ciphertext, tag, or IV has been mutated.
 * Callers should treat any thrown error as a corrupted DB row rather
 * than retrying.
 */
export function decryptPrivateKey(ciphertextB64: string): string {
  if (typeof ciphertextB64 !== 'string' || ciphertextB64.length === 0) {
    throw new Error('wallet-crypto: ciphertext must be a non-empty string');
  }
  const blob = Buffer.from(ciphertextB64, 'base64');
  if (blob.length < IV_BYTES + TAG_BYTES + 1) {
    // 1-byte minimum payload: iv (12) + tag (16) + >=1 ciphertext byte.
    throw new Error('wallet-crypto: ciphertext is too short to be valid');
  }
  const iv = blob.subarray(0, IV_BYTES);
  const tag = blob.subarray(blob.length - TAG_BYTES);
  const ciphertext = blob.subarray(IV_BYTES, blob.length - TAG_BYTES);

  const key = deriveKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString('utf8');
}
