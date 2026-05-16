'use client';

import { useActionState } from 'react';

import { submitBulkImport, type BulkImportState } from './actions';

const initial: BulkImportState = { status: 'idle' };

export function BulkImportForm({ sampleCsv }: { sampleCsv: string }) {
  const [state, formAction, pending] = useActionState(submitBulkImport, initial);

  return (
    <>
      <form action={formAction} className="mt-8 space-y-5">
        {state.status === 'unauthenticated' && (
          <Alert>
            Your session expired. <a href="/sign-in">Sign in again</a>.
          </Alert>
        )}
        {state.status === 'no-actor' && (
          <Alert>
            Finish onboarding first — <a href="/onboarding">create your actor profile</a>.
          </Alert>
        )}
        {state.status === 'invalid' && <Alert>{state.message}</Alert>}

        <label className="block">
          <span className="text-sm font-medium text-soil-800">CSV file</span>
          <input
            type="file"
            name="csvFile"
            accept=".csv,text/csv"
            className="mt-1 block w-full text-sm text-soil-800 file:mr-4 file:rounded-md file:border-0 file:bg-leaf-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-leaf-700 hover:file:bg-leaf-100"
          />
          <span className="mt-1 block text-xs text-soil-600">Or paste rows below.</span>
        </label>

        <label className="block">
          <span className="text-sm font-medium text-soil-800">CSV body</span>
          <textarea
            name="csvText"
            rows={10}
            defaultValue={sampleCsv}
            spellCheck={false}
            className="mt-1 block w-full rounded-md border border-soil-300 bg-white px-3 py-2 font-mono text-xs text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
          />
        </label>

        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className="inline-flex h-11 w-full items-center justify-center rounded-md bg-leaf-600 px-6 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? 'Importing rows…' : 'Import plots'}
        </button>
      </form>

      {state.status === 'done' && (
        <section className="mt-10 rounded-md border border-soil-200 bg-white p-5">
          <header className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-soil-900">Import complete</h2>
            <p className="text-xs text-soil-700">
              <span className="font-semibold text-leaf-700">{state.result.succeeded}</span>{' '}
              succeeded
              <span className="px-2 text-soil-400">·</span>
              <span className="font-semibold text-red-700">{state.result.failed}</span> failed
              <span className="px-2 text-soil-400">·</span>
              <span className="font-semibold text-soil-900">{state.result.totalRows}</span> total
            </p>
          </header>

          <ul className="mt-5 space-y-2">
            {state.result.rows.map((row) => (
              <li
                key={row.rowNumber}
                className={`rounded-md border px-4 py-3 text-xs ${
                  row.status === 'ok'
                    ? 'border-leaf-200 bg-leaf-50 text-leaf-800'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}
              >
                <span className="font-mono text-soil-600">row {row.rowNumber}</span>
                {row.status === 'ok' ? (
                  <span className="ml-2">
                    plot <code>{row.plotId}</code>
                    {row.onChainTopicId
                      ? ` · committed to ${row.onChainTopicId}`
                      : ' · pending HCS commit'}
                  </span>
                ) : (
                  <span className="ml-2">
                    {row.issues?.map((i) => `${i.path}: ${i.message}`).join(' · ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      {children}
    </div>
  );
}
