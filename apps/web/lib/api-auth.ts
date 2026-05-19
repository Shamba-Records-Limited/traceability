import { and, eq, isNull, sql } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { db } from './db';
import { hashApiKey, looksLikeApiKey } from './api-key-crypto';

const { apiKeys } = schema;

/**
 * Closed set of scopes the platform recognises. Add new entries here
 * (and update the dashboard's checkbox list) when a new API surface
 * needs to be gated. Keep the namespace::action shape for readability.
 */
export const API_SCOPES = [
  'plots:read',
  'batches:read',
  'events:read',
  'lineage:read',
  'dds:read',
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export interface ResolvedApiKey {
  id: string;
  actorId: string;
  scopes: ApiScope[];
}

/**
 * Returned when the bearer token is malformed, unknown, or revoked.
 * Carries the wire-level reason so callers can pick the right HTTP
 * status code (401 vs 403) without re-deriving it.
 */
export type ResolveResult =
  | { ok: true; key: ResolvedApiKey }
  | { ok: false; status: 401; reason: 'missing' | 'malformed' | 'unknown' | 'revoked' }
  | { ok: false; status: 403; reason: 'scope'; required: ApiScope; provided: ApiScope[] };

/**
 * Validate the `Authorization: Bearer <token>` header against the
 * `api_keys` table. Returns the resolved key + actor scope on success,
 * or a structured failure carrying the right HTTP status.
 *
 * Side effects:
 *   - On a successful match, the key's `last_used_at` is bumped to now.
 *     The update is fire-and-forget so an auth lookup isn't gated on a
 *     write round-trip; a failure to bump is logged but does not cause
 *     auth to fail.
 *
 * Required scope semantics: if `requiredScope` is supplied the resolved
 * key MUST list it; otherwise authentication-only passes through with
 * whatever scopes the key has.
 */
export async function resolveApiKey(
  authorizationHeader: string | null | undefined,
  requiredScope?: ApiScope,
): Promise<ResolveResult> {
  if (!authorizationHeader) return { ok: false, status: 401, reason: 'missing' };
  // RFC 6750 §2.1: the scheme name `Bearer` is case-insensitive.
  // Match `bearer`, `BEARER`, `Bearer`, etc. all the same.
  const match = /^Bearer\s+(\S+)$/i.exec(authorizationHeader);
  if (!match) return { ok: false, status: 401, reason: 'malformed' };
  const cleartext = match[1]!;
  if (!looksLikeApiKey(cleartext)) {
    return { ok: false, status: 401, reason: 'malformed' };
  }

  const keyHash = hashApiKey(cleartext);
  const [row] = await db
    .select({
      id: apiKeys.id,
      actorId: apiKeys.actorId,
      scopes: apiKeys.scopes,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  if (!row) return { ok: false, status: 401, reason: 'unknown' };
  if (row.revokedAt) return { ok: false, status: 401, reason: 'revoked' };

  const scopes = row.scopes as ApiScope[];
  if (requiredScope && !scopes.includes(requiredScope)) {
    return { ok: false, status: 403, reason: 'scope', required: requiredScope, provided: scopes };
  }

  // Fire-and-forget last_used_at bump. Awaiting this would gate every
  // authenticated request on a write — the bump is best-effort.
  void db
    .update(apiKeys)
    .set({ lastUsedAt: sql`now()` })
    .where(and(eq(apiKeys.id, row.id), isNull(apiKeys.revokedAt)))
    .catch((error) => {
      console.warn('[api-auth] failed to bump last_used_at', {
        keyId: row.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

  return {
    ok: true,
    key: { id: row.id, actorId: row.actorId, scopes },
  };
}

/**
 * Convenience wrapper that returns a `Response` directly for the failure
 * branches; route handlers can do `const auth = await requireApiKey(...)
 * ; if (auth.kind === 'response') return auth.response;`.
 */
export type RequireResult =
  | { kind: 'ok'; key: ResolvedApiKey }
  | { kind: 'response'; response: Response };

export async function requireApiKey(
  request: Request,
  requiredScope?: ApiScope,
): Promise<RequireResult> {
  const result = await resolveApiKey(request.headers.get('authorization'), requiredScope);
  if (result.ok) return { kind: 'ok', key: result.key };

  const body =
    result.reason === 'scope'
      ? {
          error: 'forbidden',
          reason: 'scope',
          required: result.required,
          provided: result.provided,
        }
      : { error: 'unauthenticated', reason: result.reason };

  return {
    kind: 'response',
    response: new Response(JSON.stringify(body), {
      status: result.status,
      headers: {
        'content-type': 'application/json',
        'www-authenticate':
          result.status === 401
            ? 'Bearer realm="shamba-traceability", error="invalid_token"'
            : 'Bearer realm="shamba-traceability", error="insufficient_scope"',
      },
    }),
  };
}
