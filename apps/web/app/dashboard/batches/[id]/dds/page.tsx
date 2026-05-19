import Link from 'next/link';
import { redirect } from 'next/navigation';

import { eq } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { auth } from '../../../../../auth';
import { db } from '../../../../../lib/db';
import { getActorForUser } from '../../../../../lib/actor';

import { DdsGeneratorClient } from './dds-client';

const { batches } = schema;

export const metadata = {
  title: 'Generate DDS',
};

export default async function GenerateDdsPage({ params }: { params: Promise<{ id: string }> }) {
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
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header>
        <p className="text-sm font-medium uppercase tracking-widest text-leaf-600">EUDR</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-soil-900">
          Due Diligence Statement
        </h1>
        <p className="mt-3 text-sm text-soil-700">
          Issue a DDS bundle for batch <code className="font-mono">{batch.id}</code> (
          {batch.commodity}, {batch.quantity} {batch.unit}, {batch.status}). The bundle covers
          Article 9(1)(a-h) information; (i) legality lands in Phase 2. The bundle&rsquo;s SHA-256
          content hash is committed on-chain as a <code>dds_issued</code> event so any downstream
          party can verify it was the exact JSON you handed them.
        </p>
      </header>

      <DdsGeneratorClient batchId={batch.id} />

      <p className="mt-8 text-xs text-soil-600">
        <Link href="/dashboard/batches" className="underline">
          Back to batches
        </Link>
      </p>
    </main>
  );
}
