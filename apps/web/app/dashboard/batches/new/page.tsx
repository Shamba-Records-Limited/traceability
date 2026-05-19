import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '../../../../auth';
import { getActorForUser } from '../../../../lib/actor';
import { listEligibleSourcePlotsForActor } from '../../../../lib/batch';

import { NewBatchForm } from './new-batch-form';

export const metadata = {
  title: 'Create batch',
};

export default async function NewBatchPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const actor = await getActorForUser(session.user.id);
  if (!actor) redirect('/onboarding');

  const eligiblePlots = await listEligibleSourcePlotsForActor(actor.id);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header>
        <p className="text-sm font-medium uppercase tracking-widest text-leaf-600">Batches</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-soil-900">Create a batch</h1>
        <p className="mt-3 text-sm text-soil-700">
          Aggregate produce from one or more of your registered plots into a single traceable batch.
          The batch lands on-chain as an HTS NFT and emits a <code>batch_created</code> event on its
          HCS topic.
        </p>
      </header>

      {eligiblePlots.length === 0 ? (
        <section className="mt-10 rounded-md border border-dashed border-soil-300 bg-white p-8">
          <h2 className="text-lg font-semibold text-soil-900">No eligible plots yet</h2>
          <p className="mt-2 text-sm text-soil-700">
            A plot is eligible to back a batch when it&rsquo;s registered to you and its latest
            deforestation check came back negative. Register a plot first, then come back here.
          </p>
          <Link
            href="/dashboard/plots/new"
            className="mt-5 inline-flex h-10 items-center rounded-md bg-leaf-600 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700"
          >
            Register a plot
          </Link>
        </section>
      ) : (
        <NewBatchForm
          eligiblePlots={eligiblePlots.map((p) => ({
            id: p.id,
            country: p.country,
            subnational: p.subnational,
            commodities: p.commodities,
            areaHectares: p.areaHectares,
          }))}
        />
      )}

      <p className="mt-8 text-xs text-soil-600">
        <Link href="/dashboard/batches" className="underline">
          Back to batches
        </Link>
      </p>
    </main>
  );
}
