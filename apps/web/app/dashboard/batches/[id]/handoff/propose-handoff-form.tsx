'use client';

import { useActionState } from 'react';

import { submitProposeHandoff, type ProposeState } from './actions';

const initial: ProposeState = { status: 'idle' };

export function ProposeHandoffForm({
  batchId,
  batchUnit,
  maxQuantity,
}: {
  batchId: string;
  batchUnit: string;
  maxQuantity: number;
}) {
  const [state, action, pending] = useActionState(submitProposeHandoff, initial);

  return (
    <form action={action} className="mt-8 space-y-5">
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="unit" value={batchUnit} />

      {state.status === 'error' && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {state.message}
        </div>
      )}

      <label className="block">
        <span className="text-sm font-medium text-soil-800">Recipient DID</span>
        <input
          type="text"
          name="toActorDid"
          required
          spellCheck={false}
          placeholder="did:hedera:testnet:0.0.12345"
          className="mt-1 block h-11 w-full rounded-md border border-soil-300 bg-white px-3 font-mono text-xs text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
        />
        <span className="mt-1 block text-xs text-soil-600">
          The receiving actor must be registered. Ask them for their DID from their dashboard.
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-soil-800">Quantity ({batchUnit})</span>
        <input
          type="number"
          name="quantity"
          required
          min="0"
          step="0.0001"
          max={maxQuantity}
          defaultValue={maxQuantity}
          className="mt-1 block h-11 w-full rounded-md border border-soil-300 bg-white px-3 text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
        />
        <span className="mt-1 block text-xs text-soil-600">
          Max {maxQuantity} {batchUnit} (the batch&rsquo;s recorded quantity).
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-medium text-soil-800">Notes (optional)</span>
        <textarea
          name="notes"
          rows={3}
          maxLength={1000}
          className="mt-1 block w-full rounded-md border border-soil-300 bg-white px-3 py-2 text-sm text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-leaf-600 px-6 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Proposing...' : 'Propose handoff'}
      </button>
    </form>
  );
}
