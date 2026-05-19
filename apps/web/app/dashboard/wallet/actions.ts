'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { auth } from '../../../auth';
import { db } from '../../../lib/db';
import { getActorForUser } from '../../../lib/actor';

const { actors } = schema;

export type WalletState =
  | { status: 'idle' }
  | { status: 'unauthenticated' }
  | { status: 'no-actor' }
  | { status: 'error'; message: string }
  | { status: 'ok'; accountId: string | null };

// Hedera account id shape: `0.0.<num>`. Realm/shard are 0 today on
// every supported network; accepting the canonical form keeps us
// strict without rejecting any legitimate id. A future change may
// allow `<realm>.<shard>.<num>` if Hedera ever ships multi-realm.
const HEDERA_ACCOUNT_ID_RE = /^0\.0\.\d{1,15}$/;

export async function submitWallet(_prev: WalletState, formData: FormData): Promise<WalletState> {
  const session = await auth();
  if (!session?.user?.id) return { status: 'unauthenticated' };
  const actor = await getActorForUser(session.user.id);
  if (!actor) return { status: 'no-actor' };

  const raw = String(formData.get('hederaAccountId') ?? '').trim();
  const accountId = raw === '' ? null : raw;
  if (accountId !== null && !HEDERA_ACCOUNT_ID_RE.test(accountId)) {
    return {
      status: 'error',
      message: 'Account id must be in the canonical Hedera form `0.0.<num>` (e.g. 0.0.12345).',
    };
  }

  await db
    .update(actors)
    .set({ hederaAccountId: accountId, updatedAt: new Date() })
    .where(eq(actors.id, actor.id));

  revalidatePath('/dashboard/wallet');
  revalidatePath('/dashboard');
  return { status: 'ok', accountId };
}
