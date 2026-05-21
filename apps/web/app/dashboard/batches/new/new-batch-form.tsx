'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { commodityLabel, eudrCommoditySchema, extendedCommoditySchema } from '@shamba/shared-types';

import { submitCreateBatch, type CreateBatchState } from './actions';

const initial: CreateBatchState = { status: 'idle' };

// Render commodities in two `<optgroup>`s so the EUDR Annex I subset is
// visually distinct from the extended (non-EUDR) catalog. The DDS pipeline
// downstream still narrows to the regulated subset; this UI just lets
// operators trace non-EUDR commodities through the same primitives.
const EUDR_COMMODITY_OPTIONS = eudrCommoditySchema.options.map((value) => ({
  value,
  label: commodityLabel[value],
}));
const EXTENDED_COMMODITY_OPTIONS = extendedCommoditySchema.options.map((value) => ({
  value,
  label: commodityLabel[value],
}));

const STAGE_OPTIONS = [
  { value: 'raw', label: 'Raw (farm gate)' },
  { value: 'primary_processed', label: 'Primary processed' },
  { value: 'secondary_processed', label: 'Secondary processed' },
  { value: 'finished', label: 'Finished' },
] as const;

const UNIT_OPTIONS = [
  { value: 'kg', label: 'Kilograms (kg)' },
  { value: 'tonne', label: 'Tonnes' },
  { value: 'head', label: 'Head (cattle)' },
  { value: 'm3', label: 'Cubic metres (m3)' },
] as const;

export interface EligiblePlot {
  id: string;
  country: string;
  subnational: string | null;
  commodities: ReadonlyArray<string>;
  areaHectares: number;
}

export function NewBatchForm({ eligiblePlots }: { eligiblePlots: ReadonlyArray<EligiblePlot> }) {
  const [state, formAction, pending] = useActionState(submitCreateBatch, initial);

  const issueByPath: Record<string, string> =
    state.status === 'error'
      ? Object.fromEntries(state.issues.map((i) => [i.path, i.message]))
      : {};

  if (state.status === 'ok') {
    return (
      <section className="mt-8 rounded-md border border-leaf-200 bg-leaf-50 p-6">
        <h2 className="text-lg font-semibold text-leaf-800">Batch created</h2>
        <p className="mt-2 text-sm text-leaf-800">
          Batch <code className="font-mono">{state.batchId}</code> is now in your custody.
        </p>
        <ul className="mt-3 space-y-1 text-xs text-leaf-800">
          <li>
            NFT:{' '}
            {state.onChainTokenId
              ? `${state.onChainTokenId}${state.onChainSerialNumber ? ` #${state.onChainSerialNumber}` : ''}`
              : 'pending mint - reconciler will retry'}
          </li>
          <li>HCS topic: {state.onChainTopicId ?? 'pending commit - reconciler will retry'}</li>
        </ul>
        <div className="mt-5 flex items-center gap-3">
          <Link
            href="/dashboard/batches"
            className="inline-flex h-10 items-center rounded-md bg-leaf-600 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700"
          >
            Back to batches
          </Link>
          <Link href="/dashboard/batches/new" className="text-sm text-leaf-700 underline">
            Create another
          </Link>
        </div>
      </section>
    );
  }

  return (
    <form action={formAction} className="mt-8 space-y-5">
      {state.status === 'unauthenticated' && (
        <Alert>
          Your session expired. <a href="/sign-in">Sign in again</a>.
        </Alert>
      )}
      {state.status === 'no-actor' && (
        <Alert>
          Finish onboarding first - <a href="/onboarding">create your actor profile</a>.
        </Alert>
      )}
      {issueByPath.batch ? <Alert>{issueByPath.batch}</Alert> : null}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Commodity" htmlFor="commodity" error={issueByPath.commodity}>
          <select
            id="commodity"
            name="commodity"
            required
            className="block h-11 w-full rounded-md border border-soil-300 bg-white px-3 text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
          >
            <optgroup label="EUDR Annex I (regulated)">
              {EUDR_COMMODITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Other commodities">
              {EXTENDED_COMMODITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </optgroup>
          </select>
        </Field>
        <Field
          label="Processing stage"
          htmlFor="processingStage"
          error={issueByPath.processingStage}
        >
          <select
            id="processingStage"
            name="processingStage"
            required
            className="block h-11 w-full rounded-md border border-soil-300 bg-white px-3 text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
          >
            {STAGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Unit" htmlFor="unit" error={issueByPath.unit}>
          <select
            id="unit"
            name="unit"
            required
            className="block h-11 w-full rounded-md border border-soil-300 bg-white px-3 text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
          >
            {UNIT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Quantity" htmlFor="quantity" error={issueByPath.quantity}>
          <input
            id="quantity"
            name="quantity"
            type="number"
            min="0"
            step="0.0001"
            required
            className="block h-11 w-full rounded-md border border-soil-300 bg-white px-3 text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label="Production start"
          htmlFor="productionStart"
          error={issueByPath.productionStart}
        >
          <input
            id="productionStart"
            name="productionStart"
            type="date"
            required
            className="block h-11 w-full rounded-md border border-soil-300 bg-white px-3 text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
          />
        </Field>
        <Field label="Production end" htmlFor="productionEnd" error={issueByPath.productionEnd}>
          <input
            id="productionEnd"
            name="productionEnd"
            type="date"
            required
            className="block h-11 w-full rounded-md border border-soil-300 bg-white px-3 text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
          />
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-soil-800">Source plots</legend>
        <p className="text-xs text-soil-600">
          Only plots you own whose latest deforestation check passed are shown. The commodity above
          must appear on every selected plot.
        </p>
        <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border border-soil-200 bg-white p-3">
          {eligiblePlots.map((plot) => (
            <label key={plot.id} className="flex items-start gap-3 text-xs text-soil-800">
              <input
                type="checkbox"
                name="sourcePlotIds"
                value={plot.id}
                className="mt-0.5 h-4 w-4 rounded border-soil-300 text-leaf-600 focus:ring-leaf-500"
              />
              <span>
                <span className="block font-mono text-soil-500">{plot.id}</span>
                <span className="block">
                  {plot.country}
                  {plot.subnational ? ` - ${plot.subnational}` : ''} - {plot.commodities.join(', ')}{' '}
                  - {plot.areaHectares.toFixed(2)} ha
                </span>
              </span>
            </label>
          ))}
        </div>
        {issueByPath.sourcePlotIds ? (
          <p className="text-xs text-red-700">{issueByPath.sourcePlotIds}</p>
        ) : null}
      </fieldset>

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-leaf-600 px-6 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Creating batch...' : 'Create batch'}
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
