import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '../../../auth';
import { getActorForUser } from '../../../lib/actor';
import { listApiKeysForActor } from '../../../lib/api-keys';

import { ApiKeysClient } from './api-keys-client';

export const metadata = {
  title: 'API keys',
};

export default async function ApiKeysPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const actor = await getActorForUser(session.user.id);
  if (!actor) redirect('/onboarding');

  const keys = await listApiKeysForActor(actor.id);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-leaf-600">
            Integrations
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-soil-900">API keys</h1>
          <p className="mt-2 text-sm text-soil-700">
            Mint keys to let external systems read your plots, batches, events, and lineage via{' '}
            <code className="font-mono">/api/v1/*</code>. The full key is shown once at creation —
            store it somewhere safe. Keys are scoped to this actor&rsquo;s data.
          </p>
        </div>
      </header>

      <ApiKeysClient
        existing={keys.map((k) => ({
          id: k.id,
          name: k.name,
          prefix: k.prefix,
          scopes: k.scopes,
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          revokedAt: k.revokedAt?.toISOString() ?? null,
          createdAt: k.createdAt.toISOString(),
        }))}
      />

      <p className="mt-8 text-xs text-soil-600">
        Looking for endpoint docs? See{' '}
        <Link href="/docs/api" className="underline">
          the OpenAPI reference
        </Link>{' '}
        (also at <code>docs/api/openapi.yaml</code>).
      </p>
    </main>
  );
}
