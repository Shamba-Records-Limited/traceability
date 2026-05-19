'use client';

import { useActionState } from 'react';

import { submitAcceptHandoff, submitCancelHandoff, type ActState } from './actions';

const initial: ActState = { status: 'idle' };

export function HandoffActions({
  handoffId,
  side,
}: {
  handoffId: string;
  side: 'sender' | 'receiver';
}) {
  const [acceptState, acceptAction, acceptPending] = useActionState(submitAcceptHandoff, initial);
  const [cancelState, cancelAction, cancelPending] = useActionState(submitCancelHandoff, initial);

  return (
    <div className="flex flex-col items-end gap-2">
      {side === 'receiver' ? (
        <form action={acceptAction}>
          <input type="hidden" name="handoffId" value={handoffId} />
          <button
            type="submit"
            disabled={acceptPending}
            className="inline-flex h-8 items-center rounded-md bg-leaf-600 px-3 text-xs font-medium text-white shadow-sm transition-colors hover:bg-leaf-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {acceptPending ? 'Accepting...' : 'Accept'}
          </button>
        </form>
      ) : null}
      <form action={cancelAction}>
        <input type="hidden" name="handoffId" value={handoffId} />
        <button
          type="submit"
          disabled={cancelPending}
          className="inline-flex h-8 items-center rounded-md border border-red-300 bg-white px-3 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {cancelPending ? 'Cancelling...' : 'Cancel'}
        </button>
      </form>
      {(acceptState.status === 'error' || cancelState.status === 'error') && (
        <p className="max-w-xs text-right text-xs text-red-700">
          {acceptState.status === 'error' ? acceptState.message : null}
          {cancelState.status === 'error' ? cancelState.message : null}
        </p>
      )}
    </div>
  );
}
