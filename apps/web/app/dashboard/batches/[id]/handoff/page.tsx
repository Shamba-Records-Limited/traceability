import Link from 'next/link';
import { redirect } from 'next/navigation';

import { eq } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { auth } from '../../../../../auth';
import { db } from '../../../../../lib/db';
import { getActorForUser } from '../../../../../lib/actor';

import { ProposeHandoffForm } from './propose-handoff-form';

const { batches } = schema;

export const metadata = {
  title: 'Propose handoff',
};

export default async function ProposeHandoffPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const actor = await getActorForUser(session.user.id);
  if (!actor) redirect('/onboarding');

  const { id } = await params;
  const [batch] = await db
    .select({
      id: batches.id,
      commodity: batches.commodity,
      quantity: batches.quantity,
      unit: batches.unit,
      custodianActorId: batches.custodianActorId,
      status: batches.status,
    })
    .from(batches)
    .where(eq(batches.id, id))
    .limit(1);

  if (!batch || batch.custodianActorId !== actor.id) {
    redirect('/dashboard/batches');
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header>
        <p className="text-sm font-medium uppercase tracking-widest text-leaf-600">Batches</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-soil-900">
          Propose a handoff
        </h1>
        <p className="mt-3 text-sm text-soil-700">
          Transfer custody of batch <code className="font-mono">{batch.id}</code> ({batch.commodity}
          , {batch.quantity} {batch.unit}, {batch.status}) to another registered actor. The receiver
          must accept for the handoff to settle.
        </p>
      </header>

      <ProposeHandoffForm batchId={batch.id} batchUnit={batch.unit} maxQuantity={batch.quantity} />

      <p className="mt-8 text-xs text-soil-600">
        <Link href="/dashboard/handoffs" className="underline">
          See all handoffs
        </Link>
      </p>
    </main>
  );
}
