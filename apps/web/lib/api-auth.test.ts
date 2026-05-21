import { afterEach, describe, expect, it, vi } from 'vitest';

import { generateApiKey } from './api-key-crypto';

/**
 * Integration-ish test for the write-scope gate. We mock `./db` so the
 * scope-checking logic in `resolveApiKey` / `requireApiKey` can be
 * exercised without a real Postgres. The shape of the mock mirrors
 * Drizzle's chainable builder enough to satisfy the call sites; the
 * `select(...).from(...).where(...).limit(1)` chain resolves to a
 * single row, and the fire-and-forget `update(...)` chain is a no-op.
 *
 * Concretely we assert:
 *   - A key without `plots:write` is rejected with 403 / insufficient_scope
 *     when an endpoint demands `plots:write`.
 *   - A key WITH `plots:write` is accepted for the same scope check.
 *   - Read-only keys still pass `plots:read`.
 */

interface FakeKeyRow {
  id: string;
  actorId: string;
  scopes: string[];
  keyHash: string;
  revokedAt: Date | null;
}

const fakeRows: FakeKeyRow[] = [];

function buildSelect(filter: (row: FakeKeyRow) => boolean) {
  return {
    from() {
      return {
        where() {
          // Drizzle's predicate is opaque; we approximate by scanning
          // the in-memory rows. The test only inserts a single row per
          // case so the filter doesn't need to be sharper than this.
          return {
            limit() {
              return Promise.resolve(fakeRows.filter(filter));
            },
          };
        },
      };
    },
  };
}

vi.mock('./db', () => {
  return {
    db: {
      // resolveApiKey calls db.select({...}).from(apiKeys).where(eq(...)).limit(1)
      select() {
        return buildSelect(() => true);
      },
      // Fire-and-forget last_used_at bump. We just need .update(...).set(...).where(...).catch(...)
      update() {
        return {
          set() {
            return {
              where() {
                // Mimic a thenable that supports .catch.
                const noop = Promise.resolve();
                return {
                  catch(handler: (err: unknown) => void) {
                    return noop.catch(handler);
                  },
                };
              },
            };
          },
        };
      },
    },
  };
});

// Import AFTER the mock so api-auth picks up the stubbed db.
const { resolveApiKey, requireApiKey } = await import('./api-auth');

function seedKey(scopes: string[]): { cleartext: string; row: FakeKeyRow } {
  fakeRows.length = 0;
  const { cleartext, keyHash } = generateApiKey();
  const row: FakeKeyRow = {
    id: '00000000-0000-0000-0000-000000000001',
    actorId: '00000000-0000-0000-0000-000000000002',
    scopes,
    keyHash,
    revokedAt: null,
  };
  fakeRows.push(row);
  return { cleartext, row };
}

describe('resolveApiKey scope gating', () => {
  afterEach(() => {
    fakeRows.length = 0;
  });

  it('rejects a read-only key when the endpoint requires plots:write', async () => {
    const { cleartext } = seedKey(['plots:read']);
    const result = await resolveApiKey(`Bearer ${cleartext}`, 'plots:write');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      if (result.status === 403) {
        expect(result.reason).toBe('scope');
        expect(result.required).toBe('plots:write');
      }
    }
  });

  it('accepts a key that carries the required write scope', async () => {
    const { cleartext } = seedKey(['plots:read', 'plots:write']);
    const result = await resolveApiKey(`Bearer ${cleartext}`, 'plots:write');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.key.scopes).toContain('plots:write');
    }
  });

  it('still admits read-only keys for read scopes (backwards compatible)', async () => {
    const { cleartext } = seedKey(['plots:read']);
    const result = await resolveApiKey(`Bearer ${cleartext}`, 'plots:read');
    expect(result.ok).toBe(true);
  });

  it('rejects unrelated write scopes (batches:write without plots:write)', async () => {
    const { cleartext } = seedKey(['batches:write']);
    const result = await resolveApiKey(`Bearer ${cleartext}`, 'plots:write');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });
});

describe('requireApiKey wraps scope failures in a 403 response', () => {
  afterEach(() => {
    fakeRows.length = 0;
  });

  it('returns a JSON 403 with insufficient_scope www-authenticate header', async () => {
    const { cleartext } = seedKey(['plots:read']);
    const req = new Request('https://example.test/api/v1/plots', {
      method: 'POST',
      headers: { authorization: `Bearer ${cleartext}` },
    });
    const result = await requireApiKey(req, 'plots:write');
    expect(result.kind).toBe('response');
    if (result.kind === 'response') {
      expect(result.response.status).toBe(403);
      const wwwAuth = result.response.headers.get('www-authenticate') ?? '';
      expect(wwwAuth).toContain('insufficient_scope');
      const body = (await result.response.json()) as {
        error: string;
        reason: string;
        required: string;
      };
      expect(body.error).toBe('forbidden');
      expect(body.reason).toBe('scope');
      expect(body.required).toBe('plots:write');
    }
  });

  it('passes through when the key carries the required write scope', async () => {
    const { cleartext } = seedKey(['plots:write']);
    const req = new Request('https://example.test/api/v1/plots', {
      method: 'POST',
      headers: { authorization: `Bearer ${cleartext}` },
    });
    const result = await requireApiKey(req, 'plots:write');
    expect(result.kind).toBe('ok');
  });
});
