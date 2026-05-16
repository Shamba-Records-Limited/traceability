import Link from 'next/link';
import { redirect } from 'next/navigation';

import { auth } from '../../../../auth';
import { getActorForUser } from '../../../../lib/actor';

import { BulkImportForm } from './bulk-import-form';

export const metadata = {
  title: 'Bulk import plots',
};

// Header line must NOT be commented out — papaparse strips `#` lines before
// inferring the header. The first `#` line below is human guidance only.
const SAMPLE_CSV = `# Example CSV — replace these rows with your data.
country,commodities,geometry,subnational
KE,coffee,"{""type"":""Polygon"",""coordinates"":[[[36.8,-1.3],[36.9,-1.3],[36.9,-1.2],[36.8,-1.2],[36.8,-1.3]]]}",Kiambu County
KE,coffee;cocoa,"{""type"":""Point"",""coordinates"":[36.85,-1.25]}",`;

export default async function BulkImportPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const actor = await getActorForUser(session.user.id);
  if (!actor) redirect('/onboarding');

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header>
        <p className="text-sm font-medium uppercase tracking-widest text-leaf-600">Plots</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-soil-900">
          Bulk import plots
        </h1>
        <p className="mt-3 text-sm text-soil-700">
          Upload a CSV (or paste rows) to register many plots at once. Each row is run through the
          same validation and deforestation check as the single-plot flow; you&rsquo;ll get a
          per-row report when the import finishes.
        </p>
      </header>

      <section className="mt-8 rounded-md border border-soil-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-soil-900">Expected columns</h2>
        <dl className="mt-3 space-y-2 text-xs text-soil-700">
          <div>
            <dt className="font-mono text-soil-900">country</dt>
            <dd>ISO 3166-1 alpha-2 code (e.g. KE). Required.</dd>
          </div>
          <div>
            <dt className="font-mono text-soil-900">commodities</dt>
            <dd>
              Semicolon-delimited list (e.g. <code>coffee;cocoa</code>) from the EUDR Annex I set:
              cattle, cocoa, coffee, oil_palm, rubber, soya, wood. Required.
            </dd>
          </div>
          <div>
            <dt className="font-mono text-soil-900">geometry</dt>
            <dd>
              GeoJSON Point or Polygon in WGS 84, quoted as a CSV value. Plots over 4&nbsp;ha must
              use a Polygon (EUDR Article 9(1)(d)). Required.
            </dd>
          </div>
          <div>
            <dt className="font-mono text-soil-900">subnational</dt>
            <dd>Free-text region (e.g. county, district). Optional.</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-soil-600">
          Lines starting with <code>#</code> are comments and are skipped.
        </p>
      </section>

      <BulkImportForm sampleCsv={SAMPLE_CSV} />

      <p className="mt-8 text-xs text-soil-600">
        Need to register a single plot instead?{' '}
        <Link href="/dashboard/plots/new" className="underline">
          Use the single-plot form
        </Link>
        .
      </p>
    </main>
  );
}
