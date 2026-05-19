import Link from 'next/link';
import { redirect } from 'next/navigation';

import { eq } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { auth } from '../../../../../auth';
import { db } from '../../../../../lib/db';
import { getActorForUser } from '../../../../../lib/actor';
import { listCertificationsForBatch } from '../../../../../lib/certification';

import { CertificationsClient } from './certifications-client';

const { batches } = schema;

export const metadata = {
  title: 'Certifications',
};

export default async function CertificationsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');
  const actor = await getActorForUser(session.user.id);
  if (!actor) redirect('/onboarding');

  const { id } = await params;
  const [batch] = await db
    .select({
      id: batches.id,
      commodity: batches.commodity,
      custodianActorId: batches.custodianActorId,
    })
    .from(batches)
    .where(eq(batches.id, id))
    .limit(1);
  if (!batch || batch.custodianActorId !== actor.id) {
    redirect('/dashboard/batches');
  }

  const certs = await listCertificationsForBatch(batch.id);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header>
        <p className="text-sm font-medium uppercase tracking-widest text-leaf-600">Batch</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-soil-900">Certifications</h1>
        <p className="mt-3 text-sm text-soil-700">
          Attach voluntary-scheme certifications (Fairtrade, Rainforest Alliance, Organic, ...) to
          batch <code className="font-mono">{batch.id}</code>. Each attachment emits a{' '}
          <code>certification_attached</code> event whose payload hash is committed on-chain, and
          the certifications appear on the consumer-facing trace page.
        </p>
      </header>

      <CertificationsClient
        batchId={batch.id}
        existing={certs.map((c) => ({
          id: c.id,
          scheme: c.scheme,
          issuer: c.issuer,
          certificateNumber: c.certificateNumber,
          validFrom: c.validFrom,
          validUntil: c.validUntil,
          evidenceUri: c.evidenceUri,
          notes: c.notes,
          attestedAt: c.attestedAt.toISOString(),
          revokedAt: c.revokedAt?.toISOString() ?? null,
        }))}
      />

      <p className="mt-8 text-xs text-soil-600">
        <Link href="/dashboard/batches" className="underline">
          Back to batches
        </Link>
      </p>
    </main>
  );
}
