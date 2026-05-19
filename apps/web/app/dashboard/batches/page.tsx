import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '../../../auth';
import { getActorForUser } from '../../../lib/actor';
import { listBatchesForActor } from '../../../lib/batch';

export const metadata = {
  title: 'Batches',
};

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
  raw: 'Raw',
  primary_processed: 'Primary processed',
  secondary_processed: 'Secondary processed',
  finished: 'Finished',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  active: 'Active',
  consumed: 'Consumed',
  exhausted: 'Exhausted',
  voided: 'Voided',
};

function hashscanTokenUrl(tokenId: string, serial: bigint | null): string {
  const base = (process.env.NEXT_PUBLIC_HASHSCAN_BASE ?? 'https://hashscan.io/testnet').replace(
    /\/$/,
    '',
  );
  return serial === null ? `${base}/token/${tokenId}` : `${base}/token/${tokenId}/${serial}`;
}

export default async function BatchesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const actor = await getActorForUser(session.user.id);
  if (!actor) redirect('/onboarding');

  const list = await listBatchesForActor(actor.id);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-leaf-600">Batches</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-soil-900">
            Traceable batches
          </h1>
          <p className="mt-2 text-sm text-soil-700">
            A batch aggregates produce from one or more registered plots and lands on-chain as an
            HTS NFT. Lineage edges record splits and merges across processing steps.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/dashboard/batches/new"
            className="inline-flex h-10 items-center rounded-md bg-leaf-600 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700"
          >
            New batch
          </Link>
        </div>
      </header>

      {list.length === 0 ? (
        <section className="mt-10 rounded-md border border-dashed border-soil-300 bg-white p-8 text-center">
          <h2 className="text-lg font-semibold text-soil-900">No batches yet</h2>
          <p className="mt-2 text-sm text-soil-700">
            Register a plot first, then aggregate its produce into a batch to start the on-chain
            audit trail.
          </p>
          <Link
            href="/dashboard/batches/new"
            className="mt-5 inline-flex h-10 items-center rounded-md bg-leaf-600 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700"
          >
            Create batch
          </Link>
        </section>
      ) : (
        <ul className="mt-8 space-y-3">
          {list.map((batch) => (
            <li
              key={batch.id}
              className="rounded-md border border-soil-200 bg-white p-5 transition-colors hover:border-soil-300"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-mono text-xs text-soil-500">{batch.id}</p>
                  <p className="mt-1 text-sm font-semibold text-soil-900">
                    {COMMODITY_LABELS[batch.commodity] ?? batch.commodity}
                    {' - '}
                    {STAGE_LABELS[batch.processingStage] ?? batch.processingStage}
                  </p>
                  <p className="mt-1 text-xs text-soil-700">
                    {batch.quantity} {batch.unit}
                    {' - '}
                    {batch.productionStart.toISOString().slice(0, 10)} to{' '}
                    {batch.productionEnd.toISOString().slice(0, 10)}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        batch.status === 'active'
                          ? 'bg-leaf-50 text-leaf-700'
                          : batch.status === 'voided'
                            ? 'bg-red-50 text-red-700'
                            : 'bg-soil-100 text-soil-700'
                      }`}
                    >
                      {STATUS_LABELS[batch.status] ?? batch.status}
                    </span>
                    {batch.onChainTokenId ? (
                      <a
                        href={hashscanTokenUrl(batch.onChainTokenId, batch.onChainSerialNumber)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-full bg-leaf-50 px-2 py-0.5 text-xs font-medium text-leaf-700 hover:bg-leaf-100"
                      >
                        NFT {batch.onChainTokenId}
                        {batch.onChainSerialNumber !== null
                          ? ` #${batch.onChainSerialNumber.toString()}`
                          : ''}
                      </a>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-soil-100 px-2 py-0.5 text-xs font-medium text-soil-700">
                        Pending NFT mint
                      </span>
                    )}
                    {batch.onChainTopicId ? (
                      <span className="inline-flex items-center rounded-full bg-leaf-50 px-2 py-0.5 text-xs font-medium text-leaf-700">
                        HCS {batch.onChainTopicId}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-soil-100 px-2 py-0.5 text-xs font-medium text-soil-700">
                        Pending HCS commit
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <time dateTime={batch.createdAt.toISOString()} className="text-xs text-soil-600">
                    {batch.createdAt.toISOString().slice(0, 10)}
                  </time>
                  {batch.status === 'active' || batch.status === 'draft' ? (
                    <Link
                      href={`/dashboard/batches/${batch.id}/handoff`}
                      className="inline-flex h-8 items-center rounded-md border border-soil-300 bg-white px-3 text-xs font-medium text-soil-900 transition-colors hover:bg-soil-100"
                    >
                      Hand off
                    </Link>
                  ) : null}
                  <Link
                    href={`/dashboard/batches/${batch.id}/dds`}
                    className="inline-flex h-8 items-center rounded-md border border-soil-300 bg-white px-3 text-xs font-medium text-soil-900 transition-colors hover:bg-soil-100"
                  >
                    DDS
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
