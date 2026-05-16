import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

// Next 16 dropped the `next lint` subcommand in favour of running ESLint
// directly. eslint-config-next 16 is flat-config native, so the presets are
// imported as-is — no FlatCompat shim required (that path produced a circular
// reference inside the legacy validator on first migration).
const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts'],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
];

export default config;
