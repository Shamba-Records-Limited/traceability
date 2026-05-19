'use client';

import { useActionState } from 'react';

import { submitGenerateDds, type GenState } from './actions';

const initial: GenState = { status: 'idle' };

export function DdsGeneratorClient({ batchId }: { batchId: string }) {
  const [state, action, pending] = useActionState(submitGenerateDds, initial);

  if (state.status === 'ok') {
    const json = JSON.stringify(state.bundle, null, 2);
    const blobUrl = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
    return (
      <section className="mt-8 rounded-md border border-leaf-200 bg-leaf-50 p-6">
        <h2 className="text-lg font-semibold text-leaf-800">DDS issued</h2>
        <dl className="mt-3 grid grid-cols-1 gap-2 text-xs text-leaf-900">
          <div>
            <dt className="font-medium">Reference number</dt>
            <dd className="font-mono">{state.ddsReferenceNumber}</dd>
          </div>
          <div>
            <dt className="font-medium">Content hash (SHA-256)</dt>
            <dd className="break-all font-mono">{state.contentHash}</dd>
          </div>
          <div>
            <dt className="font-medium">HCS topic</dt>
            <dd className="font-mono">
              {state.onChainTopicId ?? 'pending - reconciler will retry'}
            </dd>
          </div>
        </dl>
        <div className="mt-5 flex items-center gap-3">
          <a
            href={blobUrl}
            download={`${state.ddsReferenceNumber}.json`}
            className="inline-flex h-10 items-center rounded-md bg-leaf-600 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700"
          >
            Download bundle (JSON)
          </a>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(state.contentHash)}
            className="inline-flex h-10 items-center rounded-md border border-soil-300 bg-white px-4 text-sm font-medium text-soil-900 transition-colors hover:bg-soil-100"
          >
            Copy content hash
          </button>
        </div>
        <details className="mt-5">
          <summary className="cursor-pointer text-xs font-medium text-leaf-800">
            View raw JSON
          </summary>
          <pre className="mt-3 max-h-96 overflow-auto rounded-md border border-leaf-200 bg-white p-3 font-mono text-[11px] text-soil-900">
            {json}
          </pre>
        </details>
      </section>
    );
  }

  return (
    <form action={action} className="mt-8 space-y-5">
      <input type="hidden" name="batchId" value={batchId} />

      {state.status === 'error' && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {state.message}
        </div>
      )}

      <p className="text-sm text-soil-700">
        Issuing the DDS will commit its SHA-256 content hash on-chain. The bundle itself stays
        off-chain; you can re-download it any time, but every issuance produces a new reference
        number and a fresh on-chain commitment.
      </p>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="inline-flex h-11 items-center justify-center rounded-md bg-leaf-600 px-6 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Generating...' : 'Generate DDS'}
      </button>
    </form>
  );
}
