import Link from 'next/link';
import { redirect } from 'next/navigation';

import { eq } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { auth } from '../../../../../auth';
import { db } from '../../../../../lib/db';
import { getActorForUser } from '../../../../../lib/actor';
import { listSharesForBatch } from '../../../../../lib/audit-share';

import { SharesClient } from './shares-client';

const { batches } = schema;

export const metadata = {
  title: 'Audit shares',
};

export default async function SharesPage({ params }: { params: Promise<{ id: string }> }) {
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

  const shares = await listSharesForBatch(batch.id, actor.id);
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header>
        <p className="text-sm font-medium uppercase tracking-widest text-leaf-600">Audit</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-soil-900">
          Share with an auditor
        </h1>
        <p className="mt-3 text-sm text-soil-700">
          Mint a token-gated read-only URL for batch <code className="font-mono">{batch.id}</code> (
          {batch.commodity}). Anyone with the link can view the batch&rsquo;s audit trail without
          authenticating; only you can revoke or extend.
        </p>
      </header>

      <SharesClient
        batchId={batch.id}
        baseUrl={baseUrl}
        existing={shares.map((s) => ({
          id: s.id,
          label: s.label,
          tokenPrefix: s.tokenPrefix,
          expiresAt: s.expiresAt.toISOString(),
          revokedAt: s.revokedAt?.toISOString() ?? null,
          lastAccessedAt: s.lastAccessedAt?.toISOString() ?? null,
          accessCount: Number.parseInt(s.accessCount, 10) || 0,
          createdAt: s.createdAt.toISOString(),
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
