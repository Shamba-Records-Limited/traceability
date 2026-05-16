import { createClient, type Database } from '@shamba/db';

/**
 * Single-process Postgres client shared by every server-side caller in the
 * web app (Auth.js handler, server actions, route handlers, server
 * components). Avoid creating ad-hoc clients elsewhere — multiple `postgres`
 * instances would each open their own connection pool against Neon's
 * pgbouncer-style pooler and burn through the connection limit fast.
 *
 * The factory's `close()` is intentionally not called; the Node runtime
 * owns the lifetime and tears down the underlying TCP socket on process
 * exit. `createClient` is build-tolerant: during Next 16 page-data
 * collection (`process.env.NEXT_PHASE === 'phase-production-build'`)
 * it falls back to a placeholder URL so module evaluation does not throw
 * for missing credentials. Real queries at runtime require a populated
 * `DATABASE_URL`.
 */
const { db: shared } = createClient();

export const db: Database = shared;
