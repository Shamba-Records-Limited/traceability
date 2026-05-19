import { describe, expect, it } from 'vitest';

import { generateShareToken, hashShareToken, looksLikeShareToken } from './audit-share-crypto';

describe('generateShareToken', () => {
  it('produces an `audit_` prefix + 64-char hex tail', () => {
    const t = generateShareToken();
    expect(t.cleartext).toMatch(/^audit_[0-9a-f]{64}$/);
    expect(t.prefix.length).toBe(12);
    expect(t.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(t.tokenHash).toBe(hashShareToken(t.cleartext));
  });
  it('produces distinct tokens across calls', () => {
    const a = generateShareToken();
    const b = generateShareToken();
    expect(a.cleartext).not.toBe(b.cleartext);
  });
});

describe('looksLikeShareToken', () => {
  it('accepts a freshly generated token', () => {
    expect(looksLikeShareToken(generateShareToken().cleartext)).toBe(true);
  });
  it('rejects api keys (different prefix)', () => {
    expect(looksLikeShareToken('sk_shamba_' + 'a'.repeat(64))).toBe(false);
  });
  it('rejects malformed strings', () => {
    expect(looksLikeShareToken('audit_short')).toBe(false);
    expect(looksLikeShareToken('not a token')).toBe(false);
  });
});
