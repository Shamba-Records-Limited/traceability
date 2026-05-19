'use server';

import { revalidatePath } from 'next/cache';

import { auth } from '../../../../../auth';
import { getActorForUser } from '../../../../../lib/actor';
import { DdsGenerationError, generateDdsBundle, type DdsBundle } from '../../../../../lib/dds';

export type GenState =
  | { status: 'idle' }
  | { status: 'unauthenticated' }
  | { status: 'no-actor' }
  | { status: 'error'; message: string }
  | {
      status: 'ok';
      ddsReferenceNumber: string;
      contentHash: string;
      onChainTopicId: string | null;
      bundle: DdsBundle;
    };

export async function submitGenerateDds(_prev: GenState, formData: FormData): Promise<GenState> {
  const session = await auth();
  if (!session?.user?.id) return { status: 'unauthenticated' };
  const actor = await getActorForUser(session.user.id);
  if (!actor) return { status: 'no-actor' };

  const batchId = String(formData.get('batchId') ?? '');
  if (!/^[0-9a-f-]{32,36}$/i.test(batchId)) {
    return { status: 'error', message: 'Invalid batch id.' };
  }

  try {
    const result = await generateDdsBundle({ batchId, operatorActorId: actor.id });
    revalidatePath('/dashboard/batches');
    return {
      status: 'ok',
      ddsReferenceNumber: result.bundle.ddsReferenceNumber,
      contentHash: result.bundle.contentHash,
      onChainTopicId: result.onChainTopicId,
      bundle: result.bundle,
    };
  } catch (error) {
    if (error instanceof DdsGenerationError) {
      return { status: 'error', message: error.message };
    }
    return {
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
