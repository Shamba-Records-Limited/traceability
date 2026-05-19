/**
 * Cursor pagination helpers for the public /api/v1 surface. We use
 * opaque cursors (Base64-encoded JSON) instead of offset+limit so
 * pagination is stable across writes — adding a new row between page
 * reads can't cause the integrator to skip or duplicate rows.
 *
 * The cursor encodes the LAST row's sort timestamp (`sortAt`) plus its
 * `id`. Each endpoint picks the ordering timestamp that makes sense
 * for that resource — `plots.registered_at` for plots,
 * `batches.created_at` for batches, etc. — and stuffs the ISO string
 * into `sortAt`. The next page's query is "anything sorted before
 * this timestamp, or equal timestamp with a lower id", which gives a
 * total order even when timestamps collide.
 */

export interface Cursor {
  /**
   * ISO-8601 UTC instant of the last row on the previous page, on
   * whichever timestamp column the endpoint sorts by. NOT necessarily
   * `created_at` — e.g. /plots sorts by `registered_at`.
   */
  sortAt: string;
  /** UUID of the last row on the previous page. */
  id: string;
}

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(value: string | null): Cursor | null {
  if (!value) return null;
  try {
    const raw = Buffer.from(value, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as Partial<Cursor>;
    if (typeof parsed.sortAt !== 'string' || typeof parsed.id !== 'string') return null;
    if (Number.isNaN(Date.parse(parsed.sortAt))) return null;
    return { sortAt: parsed.sortAt, id: parsed.id };
  } catch {
    return null;
  }
}

/**
 * Parse `?limit=` from a URL, clamped to [1, MAX_PAGE_LIMIT]. Falls
 * back to `DEFAULT_PAGE_LIMIT` on missing / non-numeric input.
 */
export function parseLimit(value: string | null): number {
  if (!value) return DEFAULT_PAGE_LIMIT;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_PAGE_LIMIT;
  return Math.min(n, MAX_PAGE_LIMIT);
}
