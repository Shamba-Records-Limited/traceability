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
 * exit.
 */
const { db: shared } = createClient();

export const db: Database = shared;
