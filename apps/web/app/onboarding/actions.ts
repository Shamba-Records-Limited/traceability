'use server';

import { redirect } from 'next/navigation';

import { auth } from '../../auth';
import {
  createActorForUser,
  OnboardingValidationError,
  type CreateActorInput,
} from '../../lib/actor';

/**
 * Result of attempting to onboard the current user. We deliberately return a
 * `state` object rather than throwing into the client; React's `useFormState`
 * (Server Actions form integration) expects a serialisable response.
 */
export type OnboardingState =
  | { status: 'idle' }
  | { status: 'error'; issues: ReadonlyArray<{ path: string; message: string }> }
  | { status: 'unauthenticated' };

export async function submitOnboarding(
  _previous: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { status: 'unauthenticated' };
  }

  const input: CreateActorInput = {
    userId: session.user.id,
    role: String(formData.get('role') ?? '') as CreateActorInput['role'],
    displayName: String(formData.get('displayName') ?? ''),
    country: String(formData.get('country') ?? ''),
    subnational: String(formData.get('subnational') ?? '').trim() || undefined,
  };

  try {
    await createActorForUser(input);
  } catch (error) {
    if (error instanceof OnboardingValidationError) {
      return { status: 'error', issues: error.issues };
    }
    throw error;
  }

  redirect('/dashboard');
}
