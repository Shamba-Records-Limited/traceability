'use client';

import 'leaflet/dist/leaflet.css';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  TileLayer,
  useMapEvents,
} from 'react-leaflet';
import type { LeafletMouseEvent } from 'leaflet';

/**
 * Hand-rolled polygon draw component for Leaflet.
 *
 * Why not react-leaflet-draw? That package depends on react-leaflet v3
 * APIs; this app is on react-leaflet v5 + React 19, where the legacy
 * `LeafletProvider` context shape no longer matches. Rolling our own
 * with `useMapEvents` is a few dozen lines and avoids dragging in
 * `leaflet-draw` (vintage 2015 jQuery-flavoured plugin) and its CSS.
 *
 * UX:
 *   - Click on the map to drop each vertex.
 *   - The "in-progress" ring is rendered as a dashed polyline.
 *   - Double-click anywhere or press the "Finish" button to close the
 *     ring (first vertex repeated as last — GeoJSON requires this).
 *   - "Clear" wipes the polygon; "Undo" pops the most recent vertex.
 *
 * Output: GeoJSON Polygon JSON string in WGS 84 (lon, lat) order, fed
 * to the parent via onChange. Empty string when no closed polygon
 * exists.
 */

const DEFAULT_CENTER: [number, number] = [-1.2921, 36.8219]; // Nairobi
const DEFAULT_ZOOM = 7;

type LngLat = [number, number]; // [lon, lat] — GeoJSON order

export type PlotDrawProps = {
  /** Called whenever the polygon changes. Empty string when cleared. */
  onChange: (geoJson: string) => void;
  /** Optional initial polygon (GeoJSON Polygon JSON string). */
  initialGeoJson?: string;
  /** Map centre override. Defaults to Nairobi, Kenya. */
  center?: [number, number];
  /** Initial zoom level. */
  zoom?: number;
  /** Container height in pixels. */
  height?: number;
  className?: string;
};

export function PlotDraw({
  onChange,
  initialGeoJson,
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  height = 400,
  className,
}: PlotDrawProps) {
  // Vertices in the order the user placed them, [lon, lat] to match
  // the GeoJSON output we eventually emit.
  const [points, setPoints] = useState<LngLat[]>(() => parseInitial(initialGeoJson));
  // `closed` means the user has signalled they're done — we render the
  // closed Polygon and stop adding points until they clear.
  const [closed, setClosed] = useState<boolean>(() => parseInitial(initialGeoJson).length >= 3);

  // Emit GeoJSON whenever the buffer changes.
  useEffect(() => {
    if (closed && points.length >= 3) {
      const first = points[0];
      if (!first) return;
      const ring: LngLat[] = [...points, first]; // close the ring
      const geo = {
        type: 'Polygon' as const,
        coordinates: [ring.map(([lng, lat]) => [lng, lat])],
      };
      onChange(JSON.stringify(geo));
    } else {
      onChange('');
    }
  }, [points, closed, onChange]);

  const addPoint = useCallback((lng: number, lat: number) => {
    setPoints((prev) => [...prev, [lng, lat]]);
  }, []);

  const finish = useCallback(() => {
    setPoints((prev) => {
      if (prev.length < 3) return prev;
      setClosed(true);
      return prev;
    });
  }, []);

  const clear = useCallback(() => {
    setPoints([]);
    setClosed(false);
  }, []);

  const undo = useCallback(() => {
    setPoints((prev) => prev.slice(0, -1));
    setClosed(false);
  }, []);

  const areaHa = useMemo(() => {
    if (!closed || points.length < 3) return null;
    return ringAreaHectares(points);
  }, [points, closed]);

  const polylinePositions: [number, number][] = points.map(([lng, lat]) => [lat, lng]);
  const polygonPositions: [number, number][] = points.map(([lng, lat]) => [lat, lng]);

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={finish}
          disabled={closed || points.length < 3}
          className="inline-flex h-9 items-center rounded-md bg-leaf-600 px-3 text-xs font-medium text-white shadow-sm transition-colors hover:bg-leaf-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Finish polygon
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={points.length === 0}
          className="inline-flex h-9 items-center rounded-md border border-soil-300 bg-white px-3 text-xs font-medium text-soil-800 shadow-sm transition-colors hover:bg-soil-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Undo last point
        </button>
        <button
          type="button"
          onClick={clear}
          disabled={points.length === 0}
          className="inline-flex h-9 items-center rounded-md border border-soil-300 bg-white px-3 text-xs font-medium text-soil-800 shadow-sm transition-colors hover:bg-soil-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Clear
        </button>
        <span className="ml-auto text-xs text-soil-600" aria-live="polite">
          {closed
            ? `Closed polygon · ${points.length} vertices${
                areaHa !== null ? ` · ${formatHectares(areaHa)}` : ''
              }`
            : points.length === 0
              ? 'Click the map to drop the first vertex'
              : `${points.length} vertex${
                  points.length === 1 ? '' : 'es'
                } placed — keep clicking, then "Finish" (or double-click)`}
        </span>
      </div>

      <div style={{ height }} className="overflow-hidden rounded-md border border-soil-200">
        <MapContainer
          center={center}
          zoom={zoom}
          scrollWheelZoom
          doubleClickZoom={false}
          className="h-full w-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <ClickHandler disabled={closed} onAdd={addPoint} onFinish={finish} />

          {/* Open ring: while drawing */}
          {!closed && points.length >= 2 && (
            <Polyline
              positions={polylinePositions}
              pathOptions={{ color: '#2E6824', weight: 2, dashArray: '4 4' }}
            />
          )}

          {/* Closed polygon */}
          {closed && points.length >= 3 && (
            <Polygon
              positions={polygonPositions}
              pathOptions={{
                color: '#2E6824',
                weight: 2,
                fillColor: '#85BE78',
                fillOpacity: 0.35,
              }}
            />
          )}

          {/* Vertex markers — show the user exactly what they clicked. */}
          {points.map(([lng, lat], i) => (
            <CircleMarker
              key={`${i}-${lng}-${lat}`}
              center={[lat, lng]}
              radius={5}
              pathOptions={{
                color: '#234E1B',
                weight: 2,
                fillColor: i === 0 ? '#3E8530' : '#FFFFFF',
                fillOpacity: 1,
              }}
            />
          ))}
        </MapContainer>
      </div>
    </div>
  );
}

function ClickHandler({
  disabled,
  onAdd,
  onFinish,
}: {
  disabled: boolean;
  onAdd: (lng: number, lat: number) => void;
  onFinish: () => void;
}) {
  useMapEvents({
    click(e: LeafletMouseEvent) {
      if (disabled) return;
      onAdd(e.latlng.lng, e.latlng.lat);
    },
    dblclick() {
      if (disabled) return;
      onFinish();
    },
  });
  return null;
}

function parseInitial(raw: string | undefined): LngLat[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      parsed.type === 'Polygon' &&
      Array.isArray(parsed.coordinates) &&
      Array.isArray(parsed.coordinates[0])
    ) {
      const ring = parsed.coordinates[0] as unknown[];
      const points: LngLat[] = [];
      for (let i = 0; i < ring.length; i++) {
        const v = ring[i];
        if (!Array.isArray(v) || typeof v[0] !== 'number' || typeof v[1] !== 'number') {
          return [];
        }
        // GeoJSON repeats the first vertex as the last; strip it from
        // the drawing buffer so undo/clear behaviour stays intuitive.
        if (i === ring.length - 1 && ring.length > 1) {
          const first = ring[0] as [number, number];
          if (first[0] === v[0] && first[1] === v[1]) break;
        }
        points.push([v[0], v[1]]);
      }
      return points;
    }
  } catch {
    /* fall through */
  }
  return [];
}

/**
 * Approximate planar polygon area in hectares for small plots. Uses
 * the shoelace formula in metres after projecting via an
 * equirectangular approximation around the polygon centroid. Good
 * enough for the EUDR 4 ha threshold display — not for legal survey.
 */
function ringAreaHectares(points: LngLat[]): number {
  if (points.length < 3) return 0;
  const R = 6_378_137; // WGS84 equatorial radius, metres
  const meanLat =
    (points.reduce((sum, [, lat]) => sum + lat, 0) / points.length) * (Math.PI / 180);
  const cosLat = Math.cos(meanLat);
  // Convert lon/lat degrees to local metres.
  const xy = points.map(([lng, lat]) => {
    const x = ((lng * Math.PI) / 180) * R * cosLat;
    const y = ((lat * Math.PI) / 180) * R;
    return [x, y] as [number, number];
  });
  let sum = 0;
  for (let i = 0; i < xy.length; i++) {
    const a = xy[i];
    const b = xy[(i + 1) % xy.length];
    if (!a || !b) continue;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  const m2 = Math.abs(sum) / 2;
  return m2 / 10_000;
}

function formatHectares(ha: number): string {
  if (ha < 0.01) return '< 0.01 ha';
  if (ha < 1) return `${ha.toFixed(2)} ha`;
  if (ha < 100) return `${ha.toFixed(1)} ha`;
  return `${Math.round(ha)} ha`;
}
