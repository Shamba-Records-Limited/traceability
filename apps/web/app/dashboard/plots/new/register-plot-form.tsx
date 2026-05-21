'use client';

import { useActionState, useCallback, useState } from 'react';

import { PlotDrawWrapper } from '../../../../components/geo/plot-draw-wrapper';

import { submitRegisterPlot, type RegisterPlotState } from './actions';

const initial: RegisterPlotState = { status: 'idle' };

const COMMODITY_OPTIONS = [
  { value: 'coffee', label: 'Coffee' },
  { value: 'cocoa', label: 'Cocoa' },
  { value: 'cattle', label: 'Cattle' },
  { value: 'oil_palm', label: 'Oil palm' },
  { value: 'rubber', label: 'Rubber' },
  { value: 'soya', label: 'Soya' },
  { value: 'wood', label: 'Wood' },
] as const;

const SAMPLE_POLYGON = JSON.stringify(
  {
    type: 'Polygon',
    coordinates: [
      [
        [36.8, -1.3],
        [36.9, -1.3],
        [36.9, -1.2],
        [36.8, -1.2],
        [36.8, -1.3],
      ],
    ],
  },
  null,
  2,
);

export function RegisterPlotForm({ defaultCountry }: { defaultCountry: string }) {
  const [state, formAction, pending] = useActionState(submitRegisterPlot, initial);

  // `geometry` holds the GeoJSON Polygon JSON string that the server
  // action receives. Driven by the draw component or, when the user
  // toggles "Paste GeoJSON instead", by the textarea.
  // concurrent edit: feat/expand-commodity-list — that PR reshapes the
  // commodity options block above; keep the map/textarea logic below
  // intact when merging.
  const [geometry, setGeometry] = useState<string>('');
  const [useTextarea, setUseTextarea] = useState<boolean>(false);

  const handleDrawChange = useCallback((geo: string) => {
    setGeometry(geo);
  }, []);

  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setGeometry(e.target.value);
  }, []);

  const issueByPath: Record<string, string> =
    state.status === 'error'
      ? Object.fromEntries(state.issues.map((i) => [i.path, i.message]))
      : {};

  return (
    <form action={formAction} className="mt-8 space-y-5">
      {state.status === 'unauthenticated' && (
        <Alert>
          Your session expired. <a href="/sign-in">Sign in again</a>.
        </Alert>
      )}
      {state.status === 'no-actor' && (
        <Alert>
          Finish onboarding first — <a href="/onboarding">create your actor profile</a>.
        </Alert>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-soil-800">Commodities</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {COMMODITY_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm text-soil-800">
              <input
                type="checkbox"
                name="commodities"
                value={opt.value}
                className="h-4 w-4 rounded border-soil-300 text-leaf-600 focus:ring-leaf-500"
              />
              {opt.label}
            </label>
          ))}
        </div>
        {issueByPath.commodities ? (
          <p className="text-xs text-red-700">{issueByPath.commodities}</p>
        ) : null}
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Country (ISO 2)" name="country" htmlFor="country" error={issueByPath.country}>
          <input
            id="country"
            name="country"
            type="text"
            defaultValue={defaultCountry}
            minLength={2}
            maxLength={2}
            required
            className="block h-11 w-full rounded-md border border-soil-300 bg-white px-3 uppercase text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
          />
        </Field>
        <Field label="Subnational region" name="subnational" htmlFor="subnational">
          <input
            id="subnational"
            name="subnational"
            type="text"
            maxLength={200}
            className="block h-11 w-full rounded-md border border-soil-300 bg-white px-3 text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Production start" name="productionStart" htmlFor="productionStart">
          <input
            id="productionStart"
            name="productionStart"
            type="date"
            className="block h-11 w-full rounded-md border border-soil-300 bg-white px-3 text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
          />
        </Field>
        <Field label="Production end" name="productionEnd" htmlFor="productionEnd">
          <input
            id="productionEnd"
            name="productionEnd"
            type="date"
            className="block h-11 w-full rounded-md border border-soil-300 bg-white px-3 text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
          />
        </Field>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium text-soil-800">Plot boundary (WGS 84 polygon)</span>
          <button
            type="button"
            onClick={() => setUseTextarea((v) => !v)}
            className="text-xs font-medium text-leaf-700 underline-offset-2 hover:underline"
          >
            {useTextarea ? 'Draw on map instead' : 'Paste GeoJSON instead'}
          </button>
        </div>
        <p className="mt-1 text-xs text-soil-600">
          Click corners of your field on the map; double-click or hit Finish to close. The
          deforestation check runs against the 31 December 2020 cut-off.
        </p>

        <div className="mt-3">
          {useTextarea ? (
            <textarea
              id="geometry-textarea"
              rows={10}
              value={geometry || SAMPLE_POLYGON}
              onChange={handleTextareaChange}
              spellCheck={false}
              className="block w-full rounded-md border border-soil-300 bg-white px-3 py-2 font-mono text-xs text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
            />
          ) : (
            <PlotDrawWrapper onChange={handleDrawChange} initialGeoJson={geometry} />
          )}
        </div>

        {/* Server action reads this — same `geometry` field the form has
            always used, driven by either the map or the textarea. */}
        <input type="hidden" name="geometry" value={geometry} />

        {issueByPath.geometry ? (
          <p className="mt-2 text-xs text-red-700">{issueByPath.geometry}</p>
        ) : null}
      </div>

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-leaf-600 px-6 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Registering plot...' : 'Register plot'}
      </button>
    </form>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      {children}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  name: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="text-sm font-medium text-soil-800">{label}</span>
      <div className="mt-1">{children}</div>
      {error ? <span className="mt-1 block text-xs text-red-700">{error}</span> : null}
    </label>
  );
}
