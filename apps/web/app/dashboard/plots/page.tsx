import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ExternalLink, Hourglass, LandPlot, MapPin, Sprout, Upload } from 'lucide-react';
import type { GeoJsonObject } from 'geojson';

import { commodityLabel } from '@shamba/shared-types';

import { auth } from '../../../auth';
import { getActorForUser } from '../../../lib/actor';
import { listPlotsForActor } from '../../../lib/plot';
import { Badge } from '../../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { PlotMapWrapper } from '../../../components/geo/plot-map-wrapper';

export const metadata = {
  title: 'Plots',
};

// Source the label map from the shared catalog so plots/batches/audit
// stay in lock-step automatically. Cast through `Record<string, string>`
// so the lookup falls back gracefully if the DB ever returns a value not
// in the current enum.
const COMMODITY_LABELS: Record<string, string> = commodityLabel;

function formatHectares(value: number): string {
  if (value < 0.01) return '< 0.01 ha';
  return `${value.toFixed(2)} ha`;
}

function hashscanTopicUrl(topicId: string): string {
  const base = (process.env.NEXT_PUBLIC_HASHSCAN_BASE ?? 'https://hashscan.io/testnet').replace(
    /\/$/,
    '',
  );
  return `${base}/topic/${topicId}`;
}

export default async function PlotsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');
  const actor = await getActorForUser(session.user.id);
  if (!actor) redirect('/onboarding');

  const plots = await listPlotsForActor(actor.id);

  const geometries = plots
    .map((p) => {
      try {
        const parsed = JSON.parse(p.geometryJson) as GeoJsonObject;
        return { id: p.id, geometry: parsed, label: p.country };
      } catch {
        return null;
      }
    })
    .filter((g): g is { id: string; geometry: GeoJsonObject; label: string } => g !== null);

  const totalHa = plots.reduce((acc, p) => acc + p.areaHectares, 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-leaf-600">
            EUDR Article 9(1)(d)
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-soil-900 sm:text-4xl">
            Plots
          </h1>
          <p className="mt-1 text-sm text-soil-700">
            Geolocation of every plot you produce on, with the 31 December 2020 deforestation check
            on file for each.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/dashboard/plots/import"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-soil-300 bg-white px-4 text-sm font-medium text-soil-900 shadow-sm transition-colors hover:bg-soil-100"
          >
            <Upload className="h-4 w-4" />
            Bulk import CSV
          </Link>
          <Link
            href="/dashboard/plots/new"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-leaf-600 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700"
          >
            <Sprout className="h-4 w-4" />
            Register plot
          </Link>
        </div>
      </header>

      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center gap-3 pb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-leaf-100 text-leaf-700">
              <LandPlot className="h-4 w-4" />
            </div>
            <CardTitle>Total plots</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-soil-900">{plots.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center gap-3 pb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-leaf-100 text-leaf-700">
              <MapPin className="h-4 w-4" />
            </div>
            <CardTitle>Total area</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-soil-900">{formatHectares(totalHa)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center gap-3 pb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-leaf-100 text-leaf-700">
              <Hourglass className="h-4 w-4" />
            </div>
            <CardTitle>Pending HCS</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-soil-900">
              {plots.filter((p) => !p.onChainTopicId).length}
            </p>
          </CardContent>
        </Card>
      </section>

      {plots.length === 0 ? (
        <Card className="mt-8 border-dashed bg-soil-50">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-leaf-100 text-leaf-700">
              <Sprout className="h-8 w-8" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-soil-900">No plots yet</h2>
            <p className="mt-2 max-w-md text-sm text-soil-700">
              Register your first plot to start building the audit trail. Or upload a CSV to onboard
              a whole cooperative at once.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <Link
                href="/dashboard/plots/new"
                className="inline-flex h-10 items-center gap-2 rounded-md bg-leaf-600 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700"
              >
                <Sprout className="h-4 w-4" />
                Register plot
              </Link>
              <Link
                href="/dashboard/plots/import"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-soil-300 bg-white px-4 text-sm font-medium text-soil-900 transition-colors hover:bg-soil-100"
              >
                <Upload className="h-4 w-4" />
                Bulk import CSV
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="mt-8">
            <Card>
              <CardHeader>
                <CardTitle>Map</CardTitle>
                <p className="text-xs text-soil-600">
                  WGS 84 geometries served straight from PostGIS via ST_AsGeoJSON. OpenStreetMap
                  basemap.
                </p>
              </CardHeader>
              <CardContent>
                <PlotMapWrapper geometries={geometries} height={420} />
              </CardContent>
            </Card>
          </section>

          <section className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {plots.map((plot) => (
              <Card
                key={plot.id}
                className="transition-colors hover:border-soil-300 hover:shadow-md"
              >
                <CardContent className="pt-6">
                  <p className="font-mono text-xs text-soil-500">{plot.id}</p>
                  <p className="mt-1 text-sm font-semibold text-soil-900">
                    {plot.country}
                    {plot.subnational ? ` · ${plot.subnational}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-soil-700">
                    {plot.commodities.map((c) => COMMODITY_LABELS[c] ?? c).join(' · ')} ·{' '}
                    {formatHectares(plot.areaHectares)}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {plot.onChainTopicId ? (
                      <a
                        href={hashscanTopicUrl(plot.onChainTopicId)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Badge tone="success">
                          <ExternalLink className="h-3 w-3" />
                          HCS {plot.onChainTopicId}
                        </Badge>
                      </a>
                    ) : (
                      <Badge tone="warning">
                        <Hourglass className="h-3 w-3" />
                        Pending HCS commit
                      </Badge>
                    )}
                    <time
                      dateTime={plot.registeredAt.toISOString()}
                      className="ml-auto text-xs text-soil-600"
                    >
                      {plot.registeredAt.toISOString().slice(0, 10)}
                    </time>
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
