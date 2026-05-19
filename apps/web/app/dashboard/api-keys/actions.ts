'use server';

import { revalidatePath } from 'next/cache';

import { auth } from '../../../auth';
import { getActorForUser } from '../../../lib/actor';
import { API_SCOPES, type ApiScope } from '../../../lib/api-auth';
import { createApiKeyForActor, revokeApiKey } from '../../../lib/api-keys';

export type CreateState =
  | { status: 'idle' }
  | { status: 'unauthenticated' }
  | { status: 'no-actor' }
  | { status: 'error'; message: string }
  | {
      status: 'ok';
      id: string;
      cleartext: string;
      prefix: string;
      scopes: ApiScope[];
    };

export async function submitCreateKey(
  _previous: CreateState,
  formData: FormData,
): Promise<CreateState> {
  const session = await auth();
  if (!session?.user?.id) return { status: 'unauthenticated' };

  const actor = await getActorForUser(session.user.id);
  if (!actor) return { status: 'no-actor' };

  const name = String(formData.get('name') ?? '').trim();
  const rawScopes = formData.getAll('scopes').map(String).filter(Boolean);
  const scopes = rawScopes.filter((s): s is ApiScope =>
    (API_SCOPES as ReadonlyArray<string>).includes(s),
  );

  if (!name) return { status: 'error', message: 'Name is required.' };
  if (scopes.length === 0) return { status: 'error', message: 'Pick at least one scope.' };

  try {
    const result = await createApiKeyForActor({ actorId: actor.id, name, scopes });
    revalidatePath('/dashboard/api-keys');
    return {
      status: 'ok',
      id: result.id,
      cleartext: result.cleartext,
      prefix: result.prefix,
      scopes: result.scopes,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Failed to mint API key.',
    };
  }
}

export type RevokeState =
  | { status: 'idle' }
  | { status: 'unauthenticated' }
  | { status: 'no-actor' }
  | { status: 'error'; message: string }
  | { status: 'ok' };

export async function submitRevokeKey(
  _previous: RevokeState,
  formData: FormData,
): Promise<RevokeState> {
  const session = await auth();
  if (!session?.user?.id) return { status: 'unauthenticated' };
  const actor = await getActorForUser(session.user.id);
  if (!actor) return { status: 'no-actor' };

  const keyId = String(formData.get('keyId') ?? '');
  if (!/^[0-9a-f-]{32,36}$/i.test(keyId)) {
    return { status: 'error', message: 'Invalid key id.' };
  }
  const ok = await revokeApiKey({ keyId, actorId: actor.id });
  if (!ok) return { status: 'error', message: 'Key not found or already revoked.' };
  revalidatePath('/dashboard/api-keys');
  return { status: 'ok' };
}
