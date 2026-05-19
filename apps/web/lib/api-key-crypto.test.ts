import { describe, expect, it } from 'vitest';

import { generateApiKey, hashApiKey, looksLikeApiKey } from './api-key-crypto';

describe('generateApiKey', () => {
  it('produces a cleartext key with the sk_shamba_ prefix and a 64-char hex tail', () => {
    const k = generateApiKey();
    expect(k.cleartext).toMatch(/^sk_shamba_[0-9a-f]{64}$/);
  });

  it('returns the first 12 chars as the prefix (matches CHAR(12))', () => {
    const k = generateApiKey();
    expect(k.prefix).toBe(k.cleartext.slice(0, 12));
    expect(k.prefix.length).toBe(12);
  });

  it('returns a 64-character SHA-256 hex of the cleartext as keyHash', () => {
    const k = generateApiKey();
    expect(k.keyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(k.keyHash).toBe(hashApiKey(k.cleartext));
  });

  it('generates distinct cleartexts across calls (high-entropy random)', () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.cleartext).not.toBe(b.cleartext);
    expect(a.keyHash).not.toBe(b.keyHash);
  });
});

describe('hashApiKey', () => {
  it('is deterministic for the same input', () => {
    const a = hashApiKey('sk_shamba_abc');
    const b = hashApiKey('sk_shamba_abc');
    expect(a).toBe(b);
  });

  it('produces a 64-character hex string', () => {
    const h = hashApiKey('any input');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hashes empty string without throwing', () => {
    expect(() => hashApiKey('')).not.toThrow();
  });
});

describe('looksLikeApiKey', () => {
  it('accepts a freshly generated key', () => {
    expect(looksLikeApiKey(generateApiKey().cleartext)).toBe(true);
  });

  it('rejects missing prefix', () => {
    expect(looksLikeApiKey('not-a-key')).toBe(false);
  });

  it('rejects wrong tail length', () => {
    expect(looksLikeApiKey('sk_shamba_abc')).toBe(false);
  });

  it('rejects non-hex tail', () => {
    expect(looksLikeApiKey(`sk_shamba_${'g'.repeat(64)}`)).toBe(false);
  });
});
