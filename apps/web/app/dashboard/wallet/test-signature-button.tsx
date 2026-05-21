'use client';

import { useActionState } from 'react';

import { testActorSignature, type TestSignatureState } from './actions';

const initial: TestSignatureState = { status: 'idle' };

/**
 * Debug action that proves the encrypted-at-rest -> in-memory-cleartext
 * decrypt round-trip for the actor's wallet. Surfaces the SHA-256
 * fingerprint of the recovered key so the user can verify it matches
 * the key they downloaded at onboarding without leaking the key itself.
 *
 * This is the visible proof that the system can sign as the actor. A
 * follow-up PR replaces the "fingerprint" call with a real publisher
 * call (HCS submit, NFT transfer) that the actor's key signs.
 */
export function TestSignatureButton() {
  const [state, action, pending] = useActionState(testActorSignature, initial);
  return (
    <form action={action}>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="inline-flex h-9 items-center justify-center rounded-md border border-soil-300 bg-soil-50 px-4 text-xs font-medium text-soil-800 transition-colors hover:bg-soil-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Decrypting...' : 'Test signature (decrypt round-trip)'}
      </button>

      {state.status === 'no-key' && (
        <p className="mt-3 text-xs text-amber-800">
          No system-managed key on file. Either the wallet is user-provided externally or it has not
          been provisioned yet.
        </p>
      )}
      {state.status === 'error' && (
        <p className="mt-3 text-xs text-red-800">Test failed: {state.message}</p>
      )}
      {state.status === 'ok' && (
        <div className="mt-3 rounded-md border border-leaf-300 bg-leaf-50 p-3 text-xs text-leaf-900">
          <p>
            Decrypted key for <code className="font-mono">{state.accountId}</code>. SHA-256
            fingerprint:
          </p>
          <code className="mt-1 block break-all font-mono">{state.keyFingerprint}</code>
        </div>
      )}
    </form>
  );
}
