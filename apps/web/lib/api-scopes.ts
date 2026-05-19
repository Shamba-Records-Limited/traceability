/**
 * Pure constants for the API key scope enum. Lives in its own
 * DB-free module so client components can import them without
 * dragging the postgres driver into the browser bundle. The DB-aware
 * resolver lives in `./api-auth.ts` and re-exports these for server
 * code.
 */

export const API_SCOPES = [
  'plots:read',
  'batches:read',
  'events:read',
  'lineage:read',
  'dds:read',
] as const;
export type ApiScope = (typeof API_SCOPES)[number];
