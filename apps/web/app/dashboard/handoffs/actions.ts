'use server';

import { revalidatePath } from 'next/cache';

import { auth } from '../../../auth';
import { getActorForUser } from '../../../lib/actor';
import { HandoffError, acceptHandoff, cancelHandoff } from '../../../lib/handoff';

export type ActState =
  | { status: 'idle' }
  | { status: 'unauthenticated' }
  | { status: 'no-actor' }
  | { status: 'error'; message: string }
  | { status: 'ok' };

export async function submitAcceptHandoff(_prev: ActState, formData: FormData): Promise<ActState> {
  const session = await auth();
  if (!session?.user?.id) return { status: 'unauthenticated' };
  const actor = await getActorForUser(session.user.id);
  if (!actor) return { status: 'no-actor' };

  const handoffId = String(formData.get('handoffId') ?? '');
  if (!/^[0-9a-f-]{32,36}$/i.test(handoffId)) {
    return { status: 'error', message: 'Invalid handoff id.' };
  }

  try {
    await acceptHandoff({ handoffId, toActorId: actor.id });
    revalidatePath('/dashboard/handoffs');
    revalidatePath('/dashboard/batches');
    return { status: 'ok' };
  } catch (error) {
    if (error instanceof HandoffError) {
      return { status: 'error', message: error.message };
    }
    return {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function submitCancelHandoff(_prev: ActState, formData: FormData): Promise<ActState> {
  const session = await auth();
  if (!session?.user?.id) return { status: 'unauthenticated' };
  const actor = await getActorForUser(session.user.id);
  if (!actor) return { status: 'no-actor' };

  const handoffId = String(formData.get('handoffId') ?? '');
  if (!/^[0-9a-f-]{32,36}$/i.test(handoffId)) {
    return { status: 'error', message: 'Invalid handoff id.' };
  }

  try {
    await cancelHandoff({ handoffId, callerActorId: actor.id });
    revalidatePath('/dashboard/handoffs');
    return { status: 'ok' };
  } catch (error) {
    if (error instanceof HandoffError) {
      return { status: 'error', message: error.message };
    }
    return {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
