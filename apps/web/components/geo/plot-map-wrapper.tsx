'use client';

import dynamic from 'next/dynamic';
import type { GeoJsonObject } from 'geojson';

/**
 * Client-side wrapper that defers loading the Leaflet-based map until
 * the browser has booted. Leaflet pokes at `window` on import; Next
 * 15+ disallows `ssr: false` in Server Components so the dynamic call
 * has to live behind a "use client" directive.
 */
const PlotMap = dynamic(() => import('./plot-map').then((m) => m.PlotMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] w-full items-center justify-center rounded-md border border-soil-200 bg-soil-50 text-sm text-soil-600">
      Loading map…
    </div>
  ),
});

export function PlotMapWrapper(props: {
  geometries: Array<{ id: string; geometry: GeoJsonObject; label?: string }>;
  className?: string;
  height?: number;
}) {
  return <PlotMap {...props} />;
}
