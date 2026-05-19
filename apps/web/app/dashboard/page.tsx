import { redirect } from 'next/navigation';

import { auth, signOut } from '../../auth';
import { getActorForUser, isPlaceholderDid } from '../../lib/actor';

export const metadata = {
  title: 'Dashboard',
};

const ROLE_LABELS: Record<string, string> = {
  cooperative: 'Cooperative',
  processor: 'Processor',
  exporter: 'Exporter',
  importer: 'Importer',
  auditor: 'Auditor',
  competent_authority: 'Competent authority',
  farmer: 'Farmer',
};

export default async function DashboardPage() {
  const session = await auth();
  // Belt and braces: middleware enforces this too, but a server-rendered
  // page should never trust the middleware exclusively.
  if (!session?.user?.id) {
    redirect('/sign-in');
  }

  const actor = await getActorForUser(session.user.id);
  if (!actor) {
    redirect('/onboarding');
  }

  const placeholderDid = isPlaceholderDid(actor.did);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-leaf-600">Dashboard</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-soil-900">
            {actor.displayName}
          </h1>
          <p className="mt-1 text-sm text-soil-700">
            {ROLE_LABELS[actor.role] ?? actor.role} · {actor.country}
            {actor.subnational ? ` · ${actor.subnational}` : ''}
          </p>
        </div>
        <form
          action={async () => {
            'use server';
            await signOut({ redirectTo: '/' });
          }}
        >
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-md border border-soil-300 bg-white px-4 text-sm font-medium text-soil-900 transition-colors hover:bg-soil-100"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="mt-10 space-y-3 rounded-md border border-soil-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-soil-900">Decentralised identifier</h2>
        <p className="font-mono text-xs break-all text-soil-700">{actor.did}</p>
        {placeholderDid ? (
          <p className="text-xs text-soil-600">
            Placeholder identifier. The <code>did-issuer</code> service mints a real{' '}
            <code>did:hedera:&hellip;</code> on its first run; this row is rotated automatically.
          </p>
        ) : null}
      </section>

      <section className="mt-6 flex items-center justify-between gap-4 rounded-md border border-soil-200 bg-white p-6">
        <div>
          <h2 className="text-lg font-semibold text-soil-900">Plots</h2>
          <p className="mt-1 text-sm text-soil-700">
            Register a plot of land you produce on. The deforestation check runs against the EUDR 31
            December 2020 cut-off.
          </p>
        </div>
        <a
          href="/dashboard/plots"
          className="inline-flex h-10 shrink-0 items-center rounded-md bg-leaf-600 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700"
        >
          Manage plots
        </a>
      </section>

      <section className="mt-6 flex items-center justify-between gap-4 rounded-md border border-soil-200 bg-white p-6">
        <div>
          <h2 className="text-lg font-semibold text-soil-900">Batches</h2>
          <p className="mt-1 text-sm text-soil-700">
            Aggregate produce from your plots into traceable batches. Each batch lands on-chain as
            an HTS NFT with an HCS event stream and lineage to its parents.
          </p>
        </div>
        <a
          href="/dashboard/batches"
          className="inline-flex h-10 shrink-0 items-center rounded-md bg-leaf-600 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700"
        >
          Manage batches
        </a>
      </section>

      <section className="mt-6 flex items-center justify-between gap-4 rounded-md border border-soil-200 bg-white p-6">
        <div>
          <h2 className="text-lg font-semibold text-soil-900">API keys</h2>
          <p className="mt-1 text-sm text-soil-700">
            Mint API keys for external systems (ERPs, importer dashboards, certifiers) to read your
            plots, batches, events, and lineage via the public <code>/api/v1</code> surface.
          </p>
        </div>
        <a
          href="/dashboard/api-keys"
          className="inline-flex h-10 shrink-0 items-center rounded-md bg-leaf-600 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700"
        >
          Manage keys
        </a>
      </section>
    </main>
  );
}
