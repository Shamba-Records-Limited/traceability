import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { decryptPrivateKey, encryptPrivateKey } from './wallet-crypto';

// Fixed AUTH_SECRET for the test suite. Long enough to look real but
// not a real production secret — anyone running tests sees this value.
const TEST_SECRET = 'shamba-test-auth-secret-do-not-use-in-production-shamba-test-auth-secret';

describe('wallet-crypto', () => {
  let originalSecret: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = originalSecret;
    }
  });

  it('round-trips a Hedera private key string', () => {
    const cleartext =
      '302e020100300506032b657004220420aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const encrypted = encryptPrivateKey(cleartext);
    expect(encrypted).not.toEqual(cleartext);
    // Sanity: base64 alphabet only.
    expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(decryptPrivateKey(encrypted)).toEqual(cleartext);
  });

  it('produces a different ciphertext for the same input on each call', () => {
    const cleartext = 'super-secret-key';
    const a = encryptPrivateKey(cleartext);
    const b = encryptPrivateKey(cleartext);
    // The IV is random; ciphertexts must not collide. Anyone observing
    // the at-rest blob must not be able to tell whether two actors
    // share the same key.
    expect(a).not.toEqual(b);
    expect(decryptPrivateKey(a)).toEqual(cleartext);
    expect(decryptPrivateKey(b)).toEqual(cleartext);
  });

  it('throws when AUTH_SECRET is missing', () => {
    // Build a ciphertext while AUTH_SECRET is set, then drop the env var
    // and confirm decrypt refuses. A pre-encrypted blob is required so
    // the size-check fast path does not short-circuit before the KDF
    // runs.
    const validCiphertext = encryptPrivateKey('payload');
    delete process.env.AUTH_SECRET;
    expect(() => encryptPrivateKey('some-key')).toThrow(/AUTH_SECRET/);
    expect(() => decryptPrivateKey(validCiphertext)).toThrow(/AUTH_SECRET/);
  });

  it('throws when AUTH_SECRET is the empty string', () => {
    process.env.AUTH_SECRET = '';
    expect(() => encryptPrivateKey('some-key')).toThrow(/AUTH_SECRET/);
  });

  it('rejects empty plaintext', () => {
    expect(() => encryptPrivateKey('')).toThrow();
  });

  it('rejects too-short ciphertext', () => {
    // Less than iv(12) + tag(16) + 1 byte = 29 bytes after base64 decode.
    const tooShort = Buffer.from('short').toString('base64');
    expect(() => decryptPrivateKey(tooShort)).toThrow(/too short/);
  });

  it('rejects tampered ciphertext', () => {
    const cleartext = 'a-private-key-of-some-length';
    const encrypted = encryptPrivateKey(cleartext);
    const blob = Buffer.from(encrypted, 'base64');
    // Flip a bit in the ciphertext region (skip the 12-byte IV prefix
    // and stay clear of the 16-byte tag at the end). writeUInt8 + the
    // readUInt8 round-trip keeps strict-null-checks happy.
    const target = blob.length - 20;
    blob.writeUInt8(blob.readUInt8(target) ^ 0x01, target);
    const tampered = blob.toString('base64');
    expect(() => decryptPrivateKey(tampered)).toThrow();
  });

  it('rejects ciphertext encrypted with a different secret', () => {
    const cleartext = 'cross-secret-test';
    process.env.AUTH_SECRET = TEST_SECRET;
    const encrypted = encryptPrivateKey(cleartext);
    process.env.AUTH_SECRET = TEST_SECRET + '-different';
    expect(() => decryptPrivateKey(encrypted)).toThrow();
  });

  it('round-trips utf-8 multibyte payloads', () => {
    // Defensive — Hedera keys are ASCII hex, but the helper is a
    // general-purpose at-rest encryptor and should not corrupt
    // arbitrary utf-8 (we use it in tests for DDS payloads too).
    const cleartext = 'unicode test: ✓ café 漢字 🌱';
    const encrypted = encryptPrivateKey(cleartext);
    expect(decryptPrivateKey(encrypted)).toEqual(cleartext);
  });
});
