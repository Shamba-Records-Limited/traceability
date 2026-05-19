'use client';

import { useActionState } from 'react';

import { submitWallet, type WalletState } from './actions';

const initial: WalletState = { status: 'idle' };

export function WalletForm({
  actorId,
  currentAccountId,
}: {
  actorId: string;
  currentAccountId: string | null;
}) {
  const [state, action, pending] = useActionState(submitWallet, initial);

  return (
    <form action={action} className="mt-8 space-y-5 rounded-md border border-soil-200 bg-white p-6">
      <input type="hidden" name="actorId" value={actorId} />

      {state.status === 'error' && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {state.message}
        </div>
      )}
      {state.status === 'ok' && (
        <div className="rounded-md border border-leaf-300 bg-leaf-50 px-4 py-3 text-sm text-leaf-800">
          {state.accountId ? (
            <>
              Saved. Future handoffs accepted by you will transfer the HTS NFT to{' '}
              <code className="font-mono">{state.accountId}</code>.
            </>
          ) : (
            <>Unlinked. The on-chain transfer step will be skipped until you link an account.</>
          )}
        </div>
      )}

      <label className="block">
        <span className="text-sm font-medium text-soil-800">Hedera account id</span>
        <input
          type="text"
          name="hederaAccountId"
          defaultValue={currentAccountId ?? ''}
          placeholder="0.0.12345"
          spellCheck={false}
          className="mt-1 block h-11 w-full rounded-md border border-soil-300 bg-white px-3 font-mono text-sm text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
        />
        <span className="mt-1 block text-xs text-soil-600">
          Canonical form <code>0.0.&lt;num&gt;</code>. Leave blank to unlink.
        </span>
      </label>

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="inline-flex h-11 items-center justify-center rounded-md bg-leaf-600 px-6 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Saving...' : 'Save wallet'}
      </button>
    </form>
  );
}
