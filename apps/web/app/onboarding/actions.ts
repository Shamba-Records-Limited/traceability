'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

import { auth } from '../../auth';
import {
  createActorForUser,
  OnboardingValidationError,
  type CreateActorInput,
  type WalletCleartext,
} from '../../lib/actor';

import { WALLET_HANDOFF_COOKIE, WALLET_HANDOFF_TTL_SECONDS, type OnboardingState } from './types';

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

  let walletCleartext: WalletCleartext | null = null;
  try {
    const result = await createActorForUser(input);
    walletCleartext = result.walletCleartext;
  } catch (error) {
    if (error instanceof OnboardingValidationError) {
      return { status: 'error', issues: error.issues };
    }
    throw error;
  }

  if (walletCleartext) {
    // Stash the cleartext wallet in an httpOnly cookie scoped to
    // `/onboarding/wallet`. The cookie is signed by the Next.js
    // platform layer and never reaches the client JS. The download
    // page reads it once, renders the keys, then clears it via a
    // separate server action.
    const cookieStore = await cookies();
    cookieStore.set({
      name: WALLET_HANDOFF_COOKIE,
      value: JSON.stringify(walletCleartext),
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/onboarding/wallet',
      maxAge: WALLET_HANDOFF_TTL_SECONDS,
    });
    redirect('/onboarding/wallet');
  }

  // No wallet provisioned (publisher down, etc.). Drop the user on
  // the dashboard; they'll see a "wallet pending" badge and can
  // attempt to provision later via the wallet page.
  redirect('/dashboard');
}

/**
 * Clear the one-time wallet-handoff cookie after the user has
 * confirmed they have saved their keys. Invoked from the
 * `/onboarding/wallet` page's "I've saved them" button.
 */
export async function dismissWalletHandoff(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete({ name: WALLET_HANDOFF_COOKIE, path: '/onboarding/wallet' });
  redirect('/dashboard');
}
