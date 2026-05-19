import { and, desc, eq, isNull } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { db } from './db';
import { generateApiKey } from './api-key-crypto';
import { API_SCOPES, type ApiScope } from './api-auth';

const { apiKeys } = schema;

export interface CreateApiKeyResult {
  id: string;
  /** Cleartext key - return ONCE to the caller, never again. */
  cleartext: string;
  prefix: string;
  scopes: ApiScope[];
}

/**
 * Create a new API key for the given actor. Returns the cleartext
 * once; subsequent reads from the DB only see the prefix + hash.
 */
export async function createApiKeyForActor(input: {
  actorId: string;
  name: string;
  scopes: ReadonlyArray<ApiScope>;
}): Promise<CreateApiKeyResult> {
  const trimmed = input.name.trim();
  if (!trimmed) throw new Error('name is required');
  if (trimmed.length > 200) throw new Error('name must be 200 chars or fewer');

  const scopes = Array.from(new Set(input.scopes));
  if (scopes.length === 0) throw new Error('at least one scope is required');
  for (const s of scopes) {
    if (!API_SCOPES.includes(s)) throw new Error(`unsupported scope: ${s}`);
  }

  const { cleartext, prefix, keyHash } = generateApiKey();
  const [row] = await db
    .insert(apiKeys)
    .values({
      actorId: input.actorId,
      name: trimmed,
      keyHash,
      prefix,
      scopes,
    })
    .returning({ id: apiKeys.id });

  if (!row) throw new Error('api_key insert returned no rows');
  return { id: row.id, cleartext, prefix, scopes };
}

/**
 * List the calling actor's API keys, newest first. The cleartext is
 * never returned — only the persisted prefix + scope + usage metadata.
 */
export async function listApiKeysForActor(actorId: string): Promise<
  Array<{
    id: string;
    name: string;
    prefix: string;
    scopes: ApiScope[];
    lastUsedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
  }>
> {
  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      scopes: apiKeys.scopes,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.actorId, actorId))
    .orderBy(desc(apiKeys.createdAt))
    .limit(100);

  return rows.map((row) => ({ ...row, scopes: row.scopes as ApiScope[] }));
}

/**
 * Revoke an API key. Returns true if the row was newly revoked, false
 * if it was already revoked, does not exist, or does not belong to
 * the calling actor (the two missing-case branches keep us from
 * leaking existence).
 */
export async function revokeApiKey(input: { keyId: string; actorId: string }): Promise<boolean> {
  const updated = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiKeys.id, input.keyId),
        eq(apiKeys.actorId, input.actorId),
        // Only flip rows whose revokedAt is currently NULL. Without
        // this predicate a double-revoke would re-stamp the timestamp
        // and return `true`, contradicting the idempotency contract.
        isNull(apiKeys.revokedAt),
      ),
    )
    .returning({ id: apiKeys.id });

  return updated.length === 1;
}
