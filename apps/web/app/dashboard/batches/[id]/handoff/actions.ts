'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';

import { auth } from '../../../../../auth';
import { getActorForUser } from '../../../../../lib/actor';
import { HandoffError, proposeHandoff } from '../../../../../lib/handoff';

const BATCH_UNITS = ['kg', 'head', 'tonne', 'm3'] as const;
type BatchUnit = (typeof BATCH_UNITS)[number];

export type ProposeState =
  | { status: 'idle' }
  | { status: 'unauthenticated' }
  | { status: 'no-actor' }
  | { status: 'error'; message: string }
  | { status: 'ok'; handoffId: string };

export async function submitProposeHandoff(
  _prev: ProposeState,
  formData: FormData,
): Promise<ProposeState> {
  const session = await auth();
  if (!session?.user?.id) return { status: 'unauthenticated' };
  const actor = await getActorForUser(session.user.id);
  if (!actor) return { status: 'no-actor' };

  const batchId = String(formData.get('batchId') ?? '');
  const toActorDid = String(formData.get('toActorDid') ?? '').trim();
  const unit = String(formData.get('unit') ?? '') as BatchUnit;
  const quantity = Number.parseFloat(String(formData.get('quantity') ?? ''));
  const notes = String(formData.get('notes') ?? '').trim() || undefined;

  if (!/^[0-9a-f-]{32,36}$/i.test(batchId)) {
    return { status: 'error', message: 'Invalid batch id.' };
  }
  if (!toActorDid) {
    return { status: 'error', message: 'Recipient DID is required.' };
  }
  if (!BATCH_UNITS.includes(unit)) {
    return { status: 'error', message: 'Invalid unit.' };
  }

  let result;
  try {
    result = await proposeHandoff({
      batchId,
      fromActorId: actor.id,
      toActorDid,
      quantity,
      unit,
      notes,
    });
  } catch (error) {
    if (error instanceof HandoffError) {
      return { status: 'error', message: error.message };
    }
    return {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  revalidatePath('/dashboard/handoffs');
  revalidatePath('/dashboard/batches');
  redirect(`/dashboard/handoffs?proposed=${result.handoffId}`);
}
