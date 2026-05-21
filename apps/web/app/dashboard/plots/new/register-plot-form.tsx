'use client';

import { useActionState } from 'react';

import { commodityLabel, eudrCommoditySchema, extendedCommoditySchema } from '@shamba/shared-types';

import { submitRegisterPlot, type RegisterPlotState } from './actions';

const initial: RegisterPlotState = { status: 'idle' };

// concurrent edit: feat/expand-commodity-list — only the commodity options
// below were touched here. If a concurrent PR rewrites the map / textarea
// section, keep the two `*_COMMODITY_OPTIONS` arrays + their checkbox
// fieldset and discard the legacy single `COMMODITY_OPTIONS` array.
//
// Two-tier rendering: EUDR Annex I commodities first under a regulated
// header, then the extended (non-EUDR) catalog. The visual split mirrors
// the type-level split in `@shamba/shared-types` so operators can tell at
// a glance which commodities flow through the EUDR DDS pipeline.
const EUDR_COMMODITY_OPTIONS = eudrCommoditySchema.options.map((value) => ({
  value,
  label: commodityLabel[value],
}));
const EXTENDED_COMMODITY_OPTIONS = extendedCommoditySchema.options.map((value) => ({
  value,
  label: commodityLabel[value],
}));

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

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-soil-800">Commodities</legend>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-leaf-700">
            EUDR Annex I (regulated)
          </p>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {EUDR_COMMODITY_OPTIONS.map((opt) => (
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
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-soil-600">
            Other commodities
          </p>
          <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {EXTENDED_COMMODITY_OPTIONS.map((opt) => (
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

      <Field
        label="Geometry (GeoJSON, WGS 84)"
        name="geometry"
        htmlFor="geometry"
        error={issueByPath.geometry}
      >
        <textarea
          id="geometry"
          name="geometry"
          rows={10}
          required
          defaultValue={SAMPLE_POLYGON}
          spellCheck={false}
          className="block w-full rounded-md border border-soil-300 bg-white px-3 py-2 font-mono text-xs text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
        />
      </Field>

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
