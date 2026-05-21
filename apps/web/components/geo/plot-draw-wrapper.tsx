'use client';

import dynamic from 'next/dynamic';

import type { PlotDrawProps } from './plot-draw';

/**
 * Client-side wrapper that defers loading the Leaflet draw component
 * until the browser has booted. Leaflet pokes at `window` on import,
 * and Next 15+ disallows `ssr: false` inside Server Components, so the
 * dynamic call has to live behind a "use client" directive — same
 * pattern as `plot-map-wrapper.tsx`.
 */
const PlotDraw = dynamic(() => import('./plot-draw').then((m) => m.PlotDraw), {
  ssr: false,
  loading: () => (
    <div className="flex h-[400px] w-full items-center justify-center rounded-md border border-soil-200 bg-soil-50 text-sm text-soil-600">
      Loading map…
    </div>
  ),
});

export function PlotDrawWrapper(props: PlotDrawProps) {
  return <PlotDraw {...props} />;
}
