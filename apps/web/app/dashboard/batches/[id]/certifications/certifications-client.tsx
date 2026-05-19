'use client';

import { useActionState } from 'react';

import {
  CERTIFICATION_SCHEMES,
  CERTIFICATION_SCHEME_LABELS,
  type CertificationScheme,
} from '../../../../../lib/certification-schemes';

import {
  submitAttachCertification,
  submitRevokeCertification,
  type AttachState,
  type RevokeState,
} from './actions';

interface CertRow {
  id: string;
  scheme: string;
  issuer: string;
  certificateNumber: string;
  validFrom: string;
  validUntil: string;
  evidenceUri: string | null;
  notes: string | null;
  attestedAt: string;
  revokedAt: string | null;
}

const attachInitial: AttachState = { status: 'idle' };
const revokeInitial: RevokeState = { status: 'idle' };

export function CertificationsClient({
  batchId,
  existing,
}: {
  batchId: string;
  existing: ReadonlyArray<CertRow>;
}) {
  const [attachState, attachAction, attachPending] = useActionState(
    submitAttachCertification,
    attachInitial,
  );
  const [revokeState, revokeAction, revokePending] = useActionState(
    submitRevokeCertification,
    revokeInitial,
  );

  return (
    <div className="mt-8 space-y-10">
      <section className="rounded-md border border-soil-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-soil-900">Attach a certification</h2>
        <form action={attachAction} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input type="hidden" name="batchId" value={batchId} />

          <label className="block sm:col-span-1">
            <span className="text-sm font-medium text-soil-800">Scheme</span>
            <select
              name="scheme"
              required
              className="mt-1 block h-11 w-full rounded-md border border-soil-300 bg-white px-3 text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
            >
              {CERTIFICATION_SCHEMES.map((s) => (
                <option key={s} value={s}>
                  {CERTIFICATION_SCHEME_LABELS[s as CertificationScheme] ?? s}
                </option>
              ))}
            </select>
          </label>

          <label className="block sm:col-span-1">
            <span className="text-sm font-medium text-soil-800">Issuer</span>
            <input
              type="text"
              name="issuer"
              required
              maxLength={200}
              className="mt-1 block h-11 w-full rounded-md border border-soil-300 bg-white px-3 text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-soil-800">Certificate number</span>
            <input
              type="text"
              name="certificateNumber"
              required
              maxLength={200}
              className="mt-1 block h-11 w-full rounded-md border border-soil-300 bg-white px-3 font-mono text-sm text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-soil-800">Valid from</span>
            <input
              type="date"
              name="validFrom"
              required
              className="mt-1 block h-11 w-full rounded-md border border-soil-300 bg-white px-3 text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-soil-800">Valid until</span>
            <input
              type="date"
              name="validUntil"
              required
              className="mt-1 block h-11 w-full rounded-md border border-soil-300 bg-white px-3 text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-soil-800">Evidence URI (IPFS / HTTPS)</span>
            <input
              type="text"
              name="evidenceUri"
              placeholder="https://... or ipfs://..."
              className="mt-1 block h-11 w-full rounded-md border border-soil-300 bg-white px-3 font-mono text-xs text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
            />
          </label>

          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-soil-800">Notes</span>
            <textarea
              name="notes"
              rows={3}
              maxLength={1000}
              className="mt-1 block w-full rounded-md border border-soil-300 bg-white px-3 py-2 text-sm text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
            />
          </label>

          {attachState.status === 'error' && (
            <div
              role="alert"
              className="sm:col-span-2 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              {attachState.message}
            </div>
          )}
          {attachState.status === 'ok' && (
            <div className="sm:col-span-2 rounded-md border border-leaf-300 bg-leaf-50 px-4 py-3 text-sm text-leaf-800">
              Attached. Certification id{' '}
              <code className="font-mono">{attachState.certificationId}</code>.
            </div>
          )}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={attachPending}
              aria-busy={attachPending}
              className="inline-flex h-11 items-center rounded-md bg-leaf-600 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {attachPending ? 'Attaching...' : 'Attach certification'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-md border border-soil-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-soil-900">Existing certifications</h2>
        {existing.length === 0 ? (
          <p className="mt-3 text-sm text-soil-600">No certifications attached yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {existing.map((c) => (
              <li key={c.id} className="rounded-md border border-soil-200 bg-soil-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-soil-900">
                      {CERTIFICATION_SCHEME_LABELS[c.scheme as CertificationScheme] ?? c.scheme}
                    </p>
                    <p className="mt-1 text-xs text-soil-700">Issued by {c.issuer}</p>
                    <p className="mt-1 font-mono text-xs text-soil-600">{c.certificateNumber}</p>
                    <p className="mt-1 text-xs text-soil-600">
                      Valid {c.validFrom} - {c.validUntil}
                    </p>
                    {c.evidenceUri ? (
                      <a
                        href={c.evidenceUri}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-xs text-leaf-700 underline"
                      >
                        Open certificate
                      </a>
                    ) : null}
                  </div>
                  <div>
                    {c.revokedAt ? (
                      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                        Revoked {c.revokedAt.slice(0, 10)}
                      </span>
                    ) : (
                      <form action={revokeAction}>
                        <input type="hidden" name="certificationId" value={c.id} />
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
