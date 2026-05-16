'use client';

import { useActionState } from 'react';

import { submitOnboarding, type OnboardingState } from './actions';

const initial: OnboardingState = { status: 'idle' };

const ROLE_OPTIONS = [
  { value: 'cooperative', label: 'Cooperative / aggregator' },
  { value: 'processor', label: 'Processor' },
  { value: 'exporter', label: 'Exporter' },
  { value: 'auditor', label: 'Auditor' },
] as const;

export function OnboardingForm({ defaultEmail }: { defaultEmail: string }) {
  const [state, formAction, pending] = useActionState(submitOnboarding, initial);

  const issueByPath: Record<string, string> =
    state.status === 'error'
      ? Object.fromEntries(state.issues.map((i) => [i.path, i.message]))
      : {};

  return (
    <form action={formAction} className="mt-8 space-y-5">
      {state.status === 'unauthenticated' && (
        <div
          role="alert"
          className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          Your session expired. <a href="/sign-in">Sign in again</a> to continue.
        </div>
      )}

      <Field label="Email" name="email" htmlFor="email">
        <input
          id="email"
          name="email"
          type="email"
          value={defaultEmail}
          readOnly
          className="block h-11 w-full rounded-md border border-soil-200 bg-soil-50 px-3 text-soil-700"
        />
      </Field>

      <Field
        label="Display name"
        name="displayName"
        htmlFor="displayName"
        error={issueByPath.displayName}
      >
        <input
          id="displayName"
          name="displayName"
          type="text"
          minLength={2}
          maxLength={200}
          required
          autoComplete="organization"
          className="block h-11 w-full rounded-md border border-soil-300 bg-white px-3 text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
        />
      </Field>

      <Field label="Role" name="role" htmlFor="role" error={issueByPath.role}>
        <select
          id="role"
          name="role"
          required
          defaultValue=""
          className="block h-11 w-full rounded-md border border-soil-300 bg-white px-3 text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
        >
          <option value="" disabled>
            Choose a role
          </option>
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Country (ISO 2)" name="country" htmlFor="country" error={issueByPath.country}>
        <input
          id="country"
          name="country"
          type="text"
          minLength={2}
          maxLength={2}
          required
          autoCapitalize="characters"
          placeholder="KE"
          className="block h-11 w-full rounded-md border border-soil-300 bg-white px-3 uppercase text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
        />
      </Field>

      <Field label="Subnational region (optional)" name="subnational" htmlFor="subnational">
        <input
          id="subnational"
          name="subnational"
          type="text"
          maxLength={200}
          className="block h-11 w-full rounded-md border border-soil-300 bg-white px-3 text-soil-900 shadow-sm focus:border-leaf-500 focus:outline-none focus:ring-2 focus:ring-leaf-500"
        />
      </Field>

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-leaf-600 px-6 text-sm font-medium text-white shadow-sm transition-colors hover:bg-leaf-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Creating your profile...' : 'Continue'}
      </button>
    </form>
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
