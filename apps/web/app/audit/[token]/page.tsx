import { notFound } from 'next/navigation';

import { commodityLabel } from '@shamba/shared-types';

import { resolveAuditShare } from '../../../lib/audit-share';

export const metadata = {
  title: 'Audit view',
};

// This page is publicly accessible — the URL token is the credential.
// No auth check, no actor lookup. Anyone with a valid, unexpired,
// unrevoked token can view the bundle.
export const dynamic = 'force-dynamic';

const COMMODITY_LABELS: Record<string, string> = commodityLabel;

export default async function AuditPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const bundle = await resolveAuditShare(token);
  if (!bundle) notFound();

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header>
        <p className="text-sm font-medium uppercase tracking-widest text-leaf-600">
          Audit view (read-only)
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-soil-900">
          {COMMODITY_LABELS[bundle.batch.commodity] ?? bundle.batch.commodity} -{' '}
          {bundle.batch.quantity} {bundle.batch.unit}
        </h1>
        <p className="mt-2 text-sm text-soil-700">
          Operator: <strong>{bundle.operator.legalName}</strong> ({bundle.operator.role},{' '}
          {bundle.operator.country}
          {bundle.operator.subnational ? `, ${bundle.operator.subnational}` : ''}).
        </p>
        <p className="mt-1 text-xs text-soil-600">
          Share label: <em>{bundle.share.label}</em>. Expires {bundle.share.expiresAt.slice(0, 10)}.
          View count: {bundle.share.accessCount}.
        </p>
      </header>

      <section className="mt-10 rounded-md border border-soil-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-soil-900">Batch</h2>
        <dl className="mt-3 grid grid-cols-2 gap-4 text-xs text-soil-800">
          <div>
            <dt className="font-medium text-soil-900">Id</dt>
            <dd className="break-all font-mono">{bundle.batch.id}</dd>
          </div>
          <div>
            <dt className="font-medium text-soil-900">Commodity / stage</dt>
            <dd>
              {bundle.batch.commodity} - {bundle.batch.processingStage}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-soil-900">Production window</dt>
            <dd>
              {bundle.batch.productionStart.slice(0, 10)} to{' '}
              {bundle.batch.productionEnd.slice(0, 10)}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-soil-900">Status</dt>
            <dd>{bundle.batch.status}</dd>
          </div>
          <div>
            <dt className="font-medium text-soil-900">On-chain HCS topic</dt>
            <dd className="break-all font-mono">{bundle.batch.onChainTopicId ?? '(pending)'}</dd>
          </div>
          <div>
            <dt className="font-medium text-soil-900">HTS NFT</dt>
            <dd className="break-all font-mono">
              {bundle.batch.onChainTokenId
                ? `${bundle.batch.onChainTokenId}${bundle.batch.onChainSerialNumber ? ` #${bundle.batch.onChainSerialNumber}` : ''}`
                : '(pending)'}
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="font-medium text-soil-900">EVM registry tx</dt>
            <dd className="break-all font-mono">
              {bundle.batch.onChainRegistryTxId ?? '(disabled or pending)'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-8 rounded-md border border-soil-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-soil-900">
          Source plots ({bundle.plots.length})
        </h2>
        <p className="mt-1 text-xs text-soil-600">
          EUDR Article 9(1)(d) geolocation per plot. Each plot carries its latest deforestation
          check (the platform&rsquo;s 31 December 2020 cut-off).
        </p>
        <ul className="mt-4 space-y-3">
          {bundle.plots.map((plot) => (
            <li key={plot.id} className="rounded-md border border-soil-200 bg-soil-50 p-4">
              <p className="font-mono text-xs text-soil-500">{plot.id}</p>
              <p className="mt-1 text-sm font-semibold text-soil-900">
                {plot.country}
                {plot.subnational ? ` - ${plot.subnational}` : ''}
              </p>
              <p className="mt-1 text-xs text-soil-700">
                {plot.commodities.join(', ')} - {plot.areaHectares.toFixed(2)} ha
              </p>
              {plot.deforestation ? (
                <p
                  className={`mt-2 text-xs ${
                    plot.deforestation.deforestationDetected ? 'text-red-700' : 'text-leaf-700'
                  }`}
                >
                  Deforestation check ({plot.deforestation.provider}) on{' '}
                  {plot.deforestation.performedAt.slice(0, 10)}:{' '}
                  {plot.deforestation.deforestationDetected
                    ? `${plot.deforestation.hectaresLostAfterCutOff ?? 0} ha lost after cut-off`
                    : 'no deforestation detected'}
                </p>
              ) : (
                <p className="mt-2 text-xs text-soil-600">No deforestation check on record.</p>
              )}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium text-soil-700">
                  GeoJSON geometry
                </summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-soil-200 bg-white p-2 font-mono text-[11px]">
                  {JSON.stringify(plot.geometry, null, 2)}
                </pre>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-md border border-soil-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-soil-900">
          Event chain ({bundle.events.length})
        </h2>
        <p className="mt-1 text-xs text-soil-600">
          Every event was committed to HCS by hashing its canonical payload to SHA-256 and
          submitting that hash on-chain. Take any event&rsquo;s <code>payloadHash</code> column and
          look it up in the HCS topic to confirm the on-chain commitment matches.
        </p>
        <ul className="mt-4 space-y-2">
          {bundle.events.map((evt) => (
            <li
              key={evt.id}
              className="rounded-md border border-soil-200 bg-soil-50 p-3 text-xs text-soil-800"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono font-semibold">{evt.type}</span>
                <time dateTime={evt.emittedAt}>{evt.emittedAt.slice(0, 19).replace('T', ' ')}</time>
              </div>
              <p className="mt-1 break-all font-mono text-[11px] text-soil-600">
                hash {evt.payloadHash}
              </p>
              <p className="mt-1 break-all font-mono text-[11px] text-soil-600">
                emitter {evt.emittedByDid}
              </p>
              {evt.onChainTopicId ? (
                <p className="mt-1 break-all font-mono text-[11px] text-leaf-700">
                  on-chain {evt.onChainTopicId} / seq {evt.onChainSequenceNumber}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-soil-500">on-chain commit pending</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-10 border-t border-soil-200 pt-6 text-xs text-soil-600">
        This audit view is generated from a token-gated read-only share. The operator can revoke it
        at any time from their dashboard. If the link stops working, contact the operator for a
        fresh share. The platform itself is open source under AGPL-3.0; commitments are stored on
        Hedera and are independently verifiable via the mirror node.
      </footer>
    </main>
  );
}
