'use client';

import { useActionState } from 'react';

import { API_SCOPES, type ApiScope } from '../../../lib/api-auth';

import { submitCreateKey, submitRevokeKey, type CreateState, type RevokeState } from './actions';

interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiScope[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

const createInitial: CreateState = { status: 'idle' };
const revokeInitial: RevokeState = { status: 'idle' };

export function ApiKeysClient({ existing }: { existing: ReadonlyArray<KeyRow> }) {
  const [createState, createAction, createPending] = useActionState(submitCreateKey, createInitial);
  const [revokeState, revokeAction, revokePending] = useActionState(submitRevokeKey, revokeInitial);

  return (
    <div className="space-y-10">
      <section className="rounded-md border border-soil-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-soil-900">Mint a new key</h2>
        <p className="mt-1 text-xs text-soil-600">
          The cleartext key is displayed ONCE below after submission. Save it in a secrets manager
          (1Password, Doppler, etc.). We only store the hash and the first 12 chars; we cannot
          recover the cleartext for you.
        </p>
        <form action={createAction} className="mt-5 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-soil-800">Name</span>
            <input
              type="text"
              name="name"
              required
              maxLength={200}
              placeholder="e.g. Acme Coffee importer dashboard"
              className="mt-1 block h-11 w-full rounded-md border border-soil-300 bg-white px-3 text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
            />
          </label>
          <fieldset>
            <legend className="text-sm font-medium text-soil-800">Scopes</legend>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {API_SCOPES.map((s) => (
                <label key={s} className="flex items-center gap-2 text-xs text-soil-800">
                  <input
                    type="checkbox"
                    name="scopes"
                    value={s}
                    className="h-4 w-4 rounded border-soil-300 text-leaf-600 focus:ring-leaf-500"
                  />
                  <code className="font-mono">{s}</code>
                </label>
              ))}
            </div>
          </fieldset>

          {createState.status === 'error' && (
            <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
              {createState.message}
            </div>
          )}

          <button
            type="submit"
            disabled={createPending}
            aria-busy={createPending}
            className="inline-flex h-11 items-center rounded-md bg-leaf-600 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {createPending ? 'Minting...' : 'Mint key'}
          </button>
        </form>

        {createState.status === 'ok' && (
          <div className="mt-5 rounded-md border border-leaf-300 bg-leaf-50 p-4">
            <p className="text-sm font-semibold text-leaf-800">Key minted - copy it now</p>
            <p className="mt-2 break-all font-mono text-xs text-leaf-900">
              {createState.cleartext}
            </p>
            <p className="mt-2 text-xs text-leaf-800">Scopes: {createState.scopes.join(', ')}</p>
            <p className="mt-2 text-xs text-leaf-800">
              This key will not be shown again. Test it with:{' '}
              <code className="font-mono">
                curl -H &quot;Authorization: Bearer {createState.cleartext.slice(0, 16)}...&quot;
                $URL/api/v1/plots
              </code>
            </p>
          </div>
        )}
      </section>

      <section className="rounded-md border border-soil-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-soil-900">Your keys</h2>
        {existing.length === 0 ? (
          <p className="mt-3 text-sm text-soil-600">You haven&rsquo;t minted any keys yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {existing.map((k) => (
              <li
                key={k.id}
                className="flex items-start justify-between gap-4 rounded-md border border-soil-200 bg-soil-50 p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-soil-900">{k.name}</p>
                  <p className="mt-1 font-mono text-xs text-soil-600">
                    {k.prefix}
                    {'...'}
                    <span className="text-soil-400"> (hidden)</span>
                  </p>
                  <p className="mt-1 text-xs text-soil-600">Scopes: {k.scopes.join(', ')}</p>
                  <p className="mt-1 text-xs text-soil-600">
                    Created {k.createdAt.slice(0, 10)}
                    {k.lastUsedAt ? ` - last used ${k.lastUsedAt.slice(0, 10)}` : ' - never used'}
                  </p>
                </div>
                <div className="shrink-0">
                  {k.revokedAt ? (
                    <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                      Revoked {k.revokedAt.slice(0, 10)}
                    </span>
                  ) : (
                    <form action={revokeAction}>
                      <input type="hidden" name="keyId" value={k.id} />
                      <button
                        type="submit"
                        disabled={revokePending}
                        className="inline-flex h-8 items-center rounded-md border border-red-300 bg-white px-3 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Revoke
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {revokeState.status === 'error' && (
          <p className="mt-3 text-xs text-red-700">{revokeState.message}</p>
        )}
      </section>
    </div>
  );
}
