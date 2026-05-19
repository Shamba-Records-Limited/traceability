'use client';

import 'leaflet/dist/leaflet.css';

import { GeoJSON, MapContainer, TileLayer } from 'react-leaflet';
import type { GeoJsonObject } from 'geojson';

/**
 * Lightweight Leaflet view for one or more plot geometries. Free
 * OpenStreetMap tiles (no API key); attribution is mandatory and
 * baked in below.
 *
 * Auto-fits the viewport to the supplied geometries via a `key` that
 * changes whenever the input set changes — Leaflet doesn't re-fit on
 * GeoJSON prop changes by default, and we don't want to bring in a
 * full state management library just to handle it.
 */
export function PlotMap({
  geometries,
  className,
  height = 360,
}: {
  geometries: Array<{ id: string; geometry: GeoJsonObject; label?: string }>;
  className?: string;
  height?: number;
}) {
  // Compute view-state from geometries inline; `geometries` is the only
  // dependency and React 19's compiler / linter prefers the direct form
  // over a useMemo wrapper for cheap derivations.
  let center: [number, number] = [-0.5, 37.5];
  for (const g of geometries) {
    const coords = extractFirstCoord(g.geometry);
    if (coords) {
      center = [coords[1], coords[0]];
      break;
    }
  }
  const fitKey = geometries.map((g) => g.id).join('|');

  return (
    <div className={className} style={{ height }}>
      <MapContainer
        key={fitKey}
        center={center}
        zoom={geometries.length === 0 ? 5 : 13}
        scrollWheelZoom={false}
        className="h-full w-full rounded-md"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {geometries.map((g) => (
          <GeoJSON
            key={g.id}
            data={g.geometry}
            style={() => ({
              color: '#2E6824',
              weight: 2,
              fillColor: '#85BE78',
              fillOpacity: 0.35,
            })}
          />
        ))}
      </MapContainer>
    </div>
  );
}

function extractFirstCoord(geometry: GeoJsonObject): [number, number] | null {
  if (!geometry || typeof geometry !== 'object') return null;
  const geo = geometry as { type?: string; coordinates?: unknown };
  if (geo.type === 'Point' && Array.isArray(geo.coordinates)) {
    const [lon, lat] = geo.coordinates as [number, number];
    if (typeof lon === 'number' && typeof lat === 'number') return [lon, lat];
  }
  if (geo.type === 'Polygon' && Array.isArray(geo.coordinates)) {
    const ring = (geo.coordinates as number[][][])[0];
    if (Array.isArray(ring) && Array.isArray(ring[0])) {
      const [lon, lat] = ring[0];
      if (typeof lon === 'number' && typeof lat === 'number') return [lon, lat];
    }
  }
  if (geo.type === 'MultiPolygon' && Array.isArray(geo.coordinates)) {
    const ring = ((geo.coordinates as number[][][][])[0] ?? [])[0];
    if (Array.isArray(ring) && Array.isArray(ring[0])) {
      const [lon, lat] = ring[0];
      if (typeof lon === 'number' && typeof lat === 'number') return [lon, lat];
    }
  }
  return null;
}
