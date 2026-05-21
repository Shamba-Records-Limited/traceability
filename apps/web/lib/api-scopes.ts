/**
 * Pure constants for the API key scope enum. Lives in its own
 * DB-free module so client components can import them without
 * dragging the postgres driver into the browser bundle. The DB-aware
 * resolver lives in `./api-auth.ts` and re-exports these for server
 * code.
 *
 * Scope naming follows the OAuth-style `<resource>:<action>` convention.
 * Reads are non-mutating and idempotent; writes create or mutate rows
 * owned by the calling key's actor. Custody-changing writes
 * (handoff acceptance/cancel) are gated behind `handoffs:write`.
 */

export const API_SCOPES = [
  // Reads.
  'plots:read',
  'batches:read',
  'events:read',
  'lineage:read',
  'dds:read',
  'handoffs:read',
  'certifications:read',
  // Writes — gate any endpoint that creates or mutates rows on the
  // calling key's actor. Adding a write scope to a key lets the
  // bearer create resources on the actor's behalf; the UI surfaces
  // this with a separate group and a warning banner.
  'plots:write',
  'batches:write',
  'handoffs:write',
  'certifications:write',
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

/**
 * Grouping for UI rendering. Each scope belongs to exactly one group;
 * the dashboard renders reads and writes as separate fieldsets with a
 * warning banner on the write group.
 */
export const API_SCOPE_GROUPS = {
  read: [
    'plots:read',
    'batches:read',
    'events:read',
    'lineage:read',
    'dds:read',
    'handoffs:read',
    'certifications:read',
  ],
  write: ['plots:write', 'batches:write', 'handoffs:write', 'certifications:write'],
} as const satisfies Record<'read' | 'write', ReadonlyArray<ApiScope>>;

export type ApiScopeGroup = keyof typeof API_SCOPE_GROUPS;

/**
 * O(1) lookup: returns true if the given scope is a write scope.
 * Used by both UI (to mark the warning group) and tests.
 */
const WRITE_SCOPE_SET = new Set<ApiScope>(API_SCOPE_GROUPS.write);
export function isWriteScope(scope: ApiScope): boolean {
  return WRITE_SCOPE_SET.has(scope);
}
