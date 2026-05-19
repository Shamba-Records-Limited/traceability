'use client';

import { useActionState, useState } from 'react';

import {
  submitCreateShare,
  submitRevokeShare,
  type CreateState,
  type RevokeState,
} from './actions';

interface ShareRow {
  id: string;
  label: string;
  tokenPrefix: string;
  expiresAt: string;
  revokedAt: string | null;
  lastAccessedAt: string | null;
  accessCount: number;
  createdAt: string;
}

const createInitial: CreateState = { status: 'idle' };
const revokeInitial: RevokeState = { status: 'idle' };

export function SharesClient({
  batchId,
  baseUrl,
  existing,
}: {
  batchId: string;
  baseUrl: string;
  existing: ReadonlyArray<ShareRow>;
}) {
  const [createState, createAction, createPending] = useActionState(
    submitCreateShare,
    createInitial,
  );
  const [revokeState, revokeAction, revokePending] = useActionState(
    submitRevokeShare,
    revokeInitial,
  );
  const [copied, setCopied] = useState(false);

  const fullUrl = createState.status === 'ok' ? `${baseUrl}/audit/${createState.cleartext}` : '';

  return (
    <div className="mt-8 space-y-10">
      <section className="rounded-md border border-soil-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-soil-900">Mint a share link</h2>
        <form action={createAction} className="mt-5 space-y-4">
          <input type="hidden" name="batchId" value={batchId} />

          <label className="block">
            <span className="text-sm font-medium text-soil-800">Label</span>
            <input
              type="text"
              name="label"
              required
              maxLength={200}
              placeholder="e.g. Acme importer dashboard - Q2 2026 shipment"
              className="mt-1 block h-11 w-full rounded-md border border-soil-300 bg-white px-3 text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
            />
            <span className="mt-1 block text-xs text-soil-600">
              Only visible to you; helps you identify which link is which.
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-soil-800">Expires after</span>
            <select
              name="expiry"
              defaultValue="90d"
              className="mt-1 block h-11 w-full rounded-md border border-soil-300 bg-white px-3 text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
            >
              <option value="1h">1 hour</option>
              <option value="24h">24 hours</option>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
              <option value="90d">90 days (default)</option>
              <option value="365d">1 year</option>
            </select>
          </label>

          {createState.status === 'error' && (
            <div
              role="alert"
              className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {createState.message}
            </div>
          )}

          <button
            type="submit"
            disabled={createPending}
            aria-busy={createPending}
            className="inline-flex h-11 items-center rounded-md bg-leaf-600 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {createPending ? 'Minting...' : 'Mint share link'}
          </button>
        </form>

        {createState.status === 'ok' && (
          <div className="mt-5 rounded-md border border-leaf-300 bg-leaf-50 p-4">
            <p className="text-sm font-semibold text-leaf-800">Share link minted - copy it now</p>
            <p className="mt-2 break-all font-mono text-xs text-leaf-900">{fullUrl}</p>
            <p className="mt-2 text-xs text-leaf-800">
              Expires {createState.expiresAt.slice(0, 19).replace('T', ' ')} UTC. The full URL will
              not be shown again; revoke from the list below if it leaks.
            </p>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(fullUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="mt-3 inline-flex h-9 items-center rounded-md border border-leaf-300 bg-white px-4 text-xs font-medium text-leaf-800 transition-colors hover:bg-leaf-100"
            >
              {copied ? 'Copied' : 'Copy URL'}
            </button>
          </div>
        )}
      </section>

      <section className="rounded-md border border-soil-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-soil-900">Existing shares</h2>
        {existing.length === 0 ? (
          <p className="mt-3 text-sm text-soil-600">No shares yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {existing.map((s) => (
              <li
                key={s.id}
                className="flex items-start justify-between gap-4 rounded-md border border-soil-200 bg-soil-50 p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-soil-900">{s.label}</p>
                  <p className="mt-1 font-mono text-xs text-soil-600">
                    {s.tokenPrefix}
                    <span className="text-soil-400">... (hidden)</span>
                  </p>
                  <p className="mt-1 text-xs text-soil-600">
                    Created {s.createdAt.slice(0, 10)} - expires {s.expiresAt.slice(0, 10)}
                  </p>
                  <p className="mt-1 text-xs text-soil-600">
                    {s.accessCount} view{s.accessCount === 1 ? '' : 's'}
                    {s.lastAccessedAt ? ` - last ${s.lastAccessedAt.slice(0, 10)}` : ''}
                  </p>
                </div>
                <div className="shrink-0">
                  {s.revokedAt ? (
                    <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                      Revoked {s.revokedAt.slice(0, 10)}
                    </span>
                  ) : (
                    <form action={revokeAction}>
                      <input type="hidden" name="shareId" value={s.id} />
                      <input type="hidden" name="batchId" value={batchId} />
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
