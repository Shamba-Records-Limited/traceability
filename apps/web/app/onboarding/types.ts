/**
 * Shared types + constants for the onboarding flow. Lives in a
 * non-`'use server'` file so server-component imports do not trip
 * Next.js's rule that server-actions files may only export async
 * functions.
 */

export type OnboardingState =
  | { status: 'idle' }
  | { status: 'error'; issues: ReadonlyArray<{ path: string; message: string }> }
  | { status: 'unauthenticated' };

/**
 * Cookie name for the one-time wallet-download payload. The cookie is
 * httpOnly + SameSite=Lax + path=/onboarding/wallet so it cannot be
 * read from JS or sent to any other route by accident, and it auto-
 * expires after 10 minutes. The page at `/onboarding/wallet` consumes
 * the cookie, renders the cleartext for the user to copy/download,
 * and clears it the moment the user confirms they have saved the
 * keys.
 */
export const WALLET_HANDOFF_COOKIE = 'shamba_wallet_handoff';
export const WALLET_HANDOFF_TTL_SECONDS = 10 * 60;
