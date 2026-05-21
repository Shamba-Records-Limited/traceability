'use client';

import { useActionState, useState } from 'react';

import { replaceWallet, type WalletState } from './actions';

const initial: WalletState = { status: 'idle' };

export function ReplaceWalletForm({ actorId }: { actorId: string }) {
  const [state, action, pending] = useActionState(replaceWallet, initial);
  const [revealed, setRevealed] = useState(false);

  return (
    <form action={action} className="mt-4 space-y-4">
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
          Saved. Future signatures will use <code className="font-mono">{state.accountId}</code>.
        </div>
      )}

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-soil-700">
          Hedera account id
        </span>
        <input
          type="text"
          name="hederaAccountId"
          placeholder="0.0.12345"
          spellCheck={false}
          required
          className="mt-1 block h-11 w-full rounded-md border border-soil-300 bg-white px-3 font-mono text-sm text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
        />
      </label>

      <label className="block">
        <span className="text-xs font-medium uppercase tracking-wide text-soil-700">
          Private key (DER hex)
        </span>
        <textarea
          name="privateKey"
          required
          rows={3}
          spellCheck={false}
          autoComplete="off"
          // type=password on textarea isn't a thing; the toggle below
          // hides the chars via `WebkitTextSecurity`. React's strict
          // CSSProperties typings don't know about this vendor
          // prefix, so we hand-roll the style object.
          style={
            revealed
              ? undefined
              : ({ WebkitTextSecurity: 'disc' } as unknown as React.CSSProperties)
          }
          className="mt-1 block w-full rounded-md border border-soil-300 bg-white px-3 py-2 font-mono text-xs text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
        />
        <div className="mt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="text-xs text-soil-700 underline"
          >
            {revealed ? 'Hide' : 'Reveal'}
          </button>
          <span className="text-xs text-soil-600">
            The DER hex Hedera tooling emits (96–256 hex chars).
          </span>
        </div>
      </label>

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="inline-flex h-11 items-center justify-center rounded-md bg-leaf-600 px-6 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Saving...' : 'Replace wallet'}
      </button>
    </form>
  );
}
