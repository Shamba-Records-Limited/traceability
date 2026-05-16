import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '../../../auth';
import { getActorForUser } from '../../../lib/actor';
import { listPlotsForActor } from '../../../lib/plot';

export const metadata = {
  title: 'Plots',
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

function formatHectares(value: number): string {
  if (value < 0.01) return '< 0.01 ha';
  return `${value.toFixed(2)} ha`;
}

export default async function PlotsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const actor = await getActorForUser(session.user.id);
  if (!actor) redirect('/onboarding');

  const plots = await listPlotsForActor(actor.id);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-widest text-leaf-600">Plots</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-soil-900">
            Registered plots
          </h1>
          <p className="mt-2 text-sm text-soil-700">
            EUDR Article 9(1)(d) geolocation, with a deforestation check against the 31 December
            2020 cut-off.
          </p>
        </div>
        <Link
          href="/dashboard/plots/new"
          className="inline-flex h-10 shrink-0 items-center rounded-md bg-leaf-600 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700"
        >
          Register plot
        </Link>
      </header>

      {plots.length === 0 ? (
        <section className="mt-10 rounded-md border border-dashed border-soil-300 bg-white p-8 text-center">
          <h2 className="text-lg font-semibold text-soil-900">No plots yet</h2>
          <p className="mt-2 text-sm text-soil-700">
            Register your first plot to start building the audit trail.
          </p>
          <Link
            href="/dashboard/plots/new"
            className="mt-5 inline-flex h-10 items-center rounded-md bg-leaf-600 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700"
          >
            Register plot
          </Link>
        </section>
      ) : (
        <ul className="mt-8 space-y-3">
          {plots.map((plot) => (
            <li
              key={plot.id}
              className="rounded-md border border-soil-200 bg-white p-5 transition-colors hover:border-soil-300"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-mono text-xs text-soil-500">{plot.id}</p>
                  <p className="mt-1 text-sm font-semibold text-soil-900">
                    {plot.country}
                    {plot.subnational ? ` · ${plot.subnational}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-soil-700">
                    {plot.commodities.map((c) => COMMODITY_LABELS[c] ?? c).join(' · ')} ·{' '}
                    {formatHectares(plot.areaHectares)}
                  </p>
                </div>
                <time dateTime={plot.registeredAt.toISOString()} className="text-xs text-soil-600">
                  {plot.registeredAt.toISOString().slice(0, 10)}
                </time>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
