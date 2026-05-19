import { notFound } from 'next/navigation';

import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { db } from '../../../lib/db';
import { CERTIFICATION_SCHEME_LABELS } from '../../../lib/certification';
import { publicTraceUrl, renderQrSvg } from '../../../lib/qr';

const { actors, batches, batchPlots, certifications, deforestationChecks, events, plots } = schema;

export const metadata = {
  title: 'Trace this batch',
};

// Publicly reachable consumer-facing page. No auth — the batch id is
// the lookup key. We do NOT show internal fields like custodian email
// or actor ids; the page is intentionally story-shaped for a consumer
// audience.
export const dynamic = 'force-dynamic';

const COMMODITY_LABELS: Record<string, string> = {
  cattle: 'Cattle',
  cocoa: 'Cocoa',
  coffee: 'Coffee',
  oil_palm: 'Oil palm',
  rubber: 'Rubber',
  soya: 'Soya',
  wood: 'Wood',
};

const STAGE_LABELS: Record<string, string> = {
  raw: 'Raw (farm gate)',
  primary_processed: 'Primary processed',
  secondary_processed: 'Secondary processed',
  finished: 'Finished',
};

export default async function ConsumerTracePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{32,36}$/i.test(id)) notFound();

  const [batch] = await db
    .select({
      id: batches.id,
      commodity: batches.commodity,
      processingStage: batches.processingStage,
      quantity: batches.quantity,
      unit: batches.unit,
      productionStart: batches.productionStart,
      productionEnd: batches.productionEnd,
      custodianActorId: batches.custodianActorId,
      status: batches.status,
      onChainTopicId: batches.onChainTopicId,
      onChainTokenId: batches.onChainTokenId,
      onChainSerialNumber: batches.onChainSerialNumber,
      onChainRegistryTxId: batches.onChainRegistryTxId,
    })
    .from(batches)
    .where(eq(batches.id, id))
    .limit(1);
  if (!batch) notFound();
  if (batch.status === 'voided') notFound();

  const [originator] = await db
    .select({
      displayName: actors.displayName,
      country: actors.country,
      subnational: actors.subnational,
      role: actors.role,
    })
    .from(actors)
    .where(eq(actors.id, batch.custodianActorId))
    .limit(1);

  const plotsRaw = await db
    .select({
      id: plots.id,
      country: plots.country,
      subnational: plots.subnational,
      commodities: plots.commodities,
      areaHectares: plots.areaHectares,
      geometryJson: sql<string>`ST_AsGeoJSON(${plots.geometry})`,
    })
    .from(plots)
    .innerJoin(batchPlots, eq(batchPlots.plotId, plots.id))
    .where(eq(batchPlots.batchId, batch.id));

  const plotIds = plotsRaw.map((p) => p.id);
  const checksRaw =
    plotIds.length === 0
      ? []
      : await db
          .select({
            id: deforestationChecks.id,
            plotId: deforestationChecks.plotId,
            provider: deforestationChecks.provider,
            performedAt: deforestationChecks.performedAt,
            deforestationDetected: deforestationChecks.deforestationDetected,
          })
          .from(deforestationChecks)
          .where(inArray(deforestationChecks.plotId, plotIds))
          .orderBy(desc(deforestationChecks.performedAt), desc(deforestationChecks.id));
  const latestByPlot = new Map<string, (typeof checksRaw)[number]>();
  for (const c of checksRaw) {
    if (!latestByPlot.has(c.plotId)) latestByPlot.set(c.plotId, c);
  }
  const allDeforestationFree = plotsRaw.every((p) => {
    const c = latestByPlot.get(p.id);
    return c && !c.deforestationDetected;
  });

  const certs = await db
    .select({
      id: certifications.id,
      scheme: certifications.scheme,
      issuer: certifications.issuer,
      certificateNumber: certifications.certificateNumber,
      validFrom: certifications.validFrom,
      validUntil: certifications.validUntil,
      evidenceUri: certifications.evidenceUri,
    })
    .from(certifications)
    .where(and(eq(certifications.batchId, batch.id), isNull(certifications.revokedAt)));

  const evts = await db
    .select({
      id: events.id,
      type: events.type,
      emittedAt: events.emittedAt,
      onChainTopicId: events.onChainTopicId,
      onChainSequenceNumber: events.onChainSequenceNumber,
    })
    .from(events)
    .where(eq(events.batchId, batch.id))
    .orderBy(asc(events.emittedAt))
    .limit(50);

  const qrSvg = await renderQrSvg(publicTraceUrl(batch.id), { width: 220, level: 'M' });

  const countriesOfProduction = Array.from(
    new Set(plotsRaw.map((p) => `${p.country}${p.subnational ? ` (${p.subnational})` : ''}`)),
  );

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="rounded-lg border border-leaf-200 bg-leaf-50 p-6">
        <p className="text-sm font-medium uppercase tracking-widest text-leaf-700">
          Shamba Traceability
        </p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-4xl font-semibold tracking-tight text-soil-900">
              {COMMODITY_LABELS[batch.commodity] ?? batch.commodity}
            </h1>
            <p className="mt-2 text-sm text-soil-700">
              {batch.quantity} {batch.unit} of{' '}
              {STAGE_LABELS[batch.processingStage] ?? batch.processingStage}, produced{' '}
              {batch.productionStart.toISOString().slice(0, 10)} to{' '}
              {batch.productionEnd.toISOString().slice(0, 10)}.
            </p>
            {originator ? (
              <p className="mt-1 text-sm text-soil-700">
                Originated by <strong>{originator.displayName}</strong> in {originator.country}
                {originator.subnational ? `, ${originator.subnational}` : ''}.
              </p>
            ) : null}
            {allDeforestationFree ? (
              <p className="mt-3 inline-flex items-center rounded-full bg-leaf-200 px-3 py-1 text-xs font-medium text-leaf-800">
                EUDR deforestation-free (verified against 31 December 2020 cut-off)
              </p>
            ) : null}
          </div>
          <div className="shrink-0">
            <div
              aria-label="QR code linking to this trace page"
              className="rounded-md border border-leaf-300 bg-white p-2"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
            <p className="mt-2 max-w-[220px] text-center text-xs text-soil-600">
              Scan to re-open this page from anywhere
            </p>
          </div>
        </div>
      </header>

      <section className="mt-8 rounded-md border border-soil-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-soil-900">Where it came from</h2>
        <p className="mt-1 text-xs text-soil-600">
          EUDR Article 9(1)(c)+(d): country (and parts of country) of production with per-plot
          geolocation.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-soil-800">Countries of production</p>
            <ul className="mt-2 space-y-1 text-sm text-soil-700">
              {countriesOfProduction.map((c) => (
                <li key={c}>- {c}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium text-soil-800">Source plots</p>
            <p className="mt-2 text-sm text-soil-700">
              {plotsRaw.length} plot{plotsRaw.length === 1 ? '' : 's'} contributed, totalling{' '}
              {plotsRaw.reduce((acc, p) => acc + p.areaHectares, 0).toFixed(2)} ha. Every plot is
              registered in WGS 84 with hashes of its GeoJSON committed on-chain.
            </p>
          </div>
        </div>
      </section>

      {certs.length > 0 ? (
        <section className="mt-8 rounded-md border border-soil-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-soil-900">Certifications</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2">
            {certs.map((c) => (
              <li key={c.id} className="rounded-md border border-soil-200 bg-soil-50 p-4">
                <p className="text-sm font-semibold text-soil-900">
                  {CERTIFICATION_SCHEME_LABELS[
                    c.scheme as keyof typeof CERTIFICATION_SCHEME_LABELS
                  ] ?? c.scheme}
                </p>
                <p className="mt-1 text-xs text-soil-700">Issued by {c.issuer}</p>
                <p className="mt-1 font-mono text-xs text-soil-600">{c.certificateNumber}</p>
                <p className="mt-1 text-xs text-soil-600">
                  Valid {c.validFrom} to {c.validUntil}
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
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8 rounded-md border border-soil-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-soil-900">On-chain anchor</h2>
        <p className="mt-1 text-xs text-soil-600">
          The platform commits a hash of every event to the Hedera Consensus Service, with a
          parallel append-only record on a Hedera EVM smart-contract registry. The values below let
          anyone independently re-verify this batch&rsquo;s commitments without trusting the
          platform.
        </p>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-xs text-soil-800 sm:grid-cols-2">
          <div>
            <dt className="font-medium text-soil-900">HCS topic</dt>
            <dd className="break-all font-mono">{batch.onChainTopicId ?? '(pending)'}</dd>
          </div>
          <div>
            <dt className="font-medium text-soil-900">HTS NFT</dt>
            <dd className="break-all font-mono">
              {batch.onChainTokenId
                ? `${batch.onChainTokenId}${batch.onChainSerialNumber ? ` #${batch.onChainSerialNumber}` : ''}`
                : '(pending)'}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium text-soil-900">EVM registry tx</dt>
            <dd className="break-all font-mono">
              {batch.onChainRegistryTxId ?? '(registry disabled or pending)'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-8 rounded-md border border-soil-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-soil-900">Event timeline</h2>
        <ol className="mt-4 space-y-2 text-xs text-soil-800">
          {evts.map((e) => (
            <li key={e.id} className="rounded-md border border-soil-200 bg-soil-50 p-3">
              <p className="font-mono text-sm font-medium text-soil-900">{e.type}</p>
              <p className="mt-1 text-soil-600">
                {e.emittedAt.toISOString().slice(0, 19).replace('T', ' ')} UTC
                {e.onChainTopicId
                  ? ` - on HCS ${e.onChainTopicId} / seq ${e.onChainSequenceNumber}`
                  : ' - on-chain commit pending'}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mt-10 border-t border-soil-200 pt-6 text-xs text-soil-600">
        This page is generated from the public traceability ledger for batch{' '}
        <code className="font-mono">{batch.id}</code>. The platform is open source under AGPL-3.0;
        commitments are anchored on Hedera and independently verifiable via the mirror node. Powered
        by Shamba Records.
      </footer>
    </main>
  );
}
