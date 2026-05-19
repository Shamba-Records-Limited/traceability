'use server';

import { revalidatePath } from 'next/cache';

import { auth } from '../../../../../auth';
import { getActorForUser } from '../../../../../lib/actor';
import {
  AuditShareError,
  createAuditShare,
  revokeAuditShare,
} from '../../../../../lib/audit-share';

export type CreateState =
  | { status: 'idle' }
  | { status: 'unauthenticated' }
  | { status: 'no-actor' }
  | { status: 'error'; message: string }
  | {
      status: 'ok';
      shareId: string;
      cleartext: string;
      expiresAt: string;
    };

const EXPIRY_OPTIONS = {
  '1h': 60 * 60 * 1_000,
  '24h': 24 * 60 * 60 * 1_000,
  '7d': 7 * 24 * 60 * 60 * 1_000,
  '30d': 30 * 24 * 60 * 60 * 1_000,
  '90d': 90 * 24 * 60 * 60 * 1_000,
  '365d': 365 * 24 * 60 * 60 * 1_000,
} as const;

export async function submitCreateShare(
  _prev: CreateState,
  formData: FormData,
): Promise<CreateState> {
  const session = await auth();
  if (!session?.user?.id) return { status: 'unauthenticated' };
  const actor = await getActorForUser(session.user.id);
  if (!actor) return { status: 'no-actor' };

  const batchId = String(formData.get('batchId') ?? '');
  const label = String(formData.get('label') ?? '').trim();
  const expiryKey = String(formData.get('expiry') ?? '90d') as keyof typeof EXPIRY_OPTIONS;
  const expiresInMs = EXPIRY_OPTIONS[expiryKey] ?? EXPIRY_OPTIONS['90d'];

  if (!/^[0-9a-f-]{32,36}$/i.test(batchId)) {
    return { status: 'error', message: 'Invalid batch id.' };
  }

  try {
    const result = await createAuditShare({
      batchId,
      operatorActorId: actor.id,
      label,
      expiresInMs,
    });
    revalidatePath(`/dashboard/batches/${batchId}/shares`);
    return {
      status: 'ok',
      shareId: result.shareId,
      cleartext: result.cleartext,
      expiresAt: result.expiresAt.toISOString(),
    };
  } catch (error) {
    if (error instanceof AuditShareError) {
      return { status: 'error', message: error.message };
    }
    return {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export type RevokeState =
  | { status: 'idle' }
  | { status: 'unauthenticated' }
  | { status: 'no-actor' }
  | { status: 'error'; message: string }
  | { status: 'ok' };

export async function submitRevokeShare(
  _prev: RevokeState,
  formData: FormData,
): Promise<RevokeState> {
  const session = await auth();
  if (!session?.user?.id) return { status: 'unauthenticated' };
  const actor = await getActorForUser(session.user.id);
  if (!actor) return { status: 'no-actor' };

  const shareId = String(formData.get('shareId') ?? '');
  const batchId = String(formData.get('batchId') ?? '');
  if (!/^[0-9a-f-]{32,36}$/i.test(shareId)) {
    return { status: 'error', message: 'Invalid share id.' };
  }
  const ok = await revokeAuditShare({ shareId, operatorActorId: actor.id });
  if (!ok) return { status: 'error', message: 'Share not found or already revoked.' };
  if (/^[0-9a-f-]{32,36}$/i.test(batchId)) {
    revalidatePath(`/dashboard/batches/${batchId}/shares`);
  }
  return { status: 'ok' };
}
