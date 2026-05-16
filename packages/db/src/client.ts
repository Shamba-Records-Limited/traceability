import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema/index';

export type Database = PostgresJsDatabase<typeof schema>;

export interface CreateClientOptions {
  /**
   * Postgres connection string. If omitted, `DATABASE_URL` is read from
   * `process.env`.
   */
  url?: string;
  /**
   * Maximum number of pooled connections. Defaults to 10, suitable for a
   * single Vercel Function instance; raise for long-lived workers.
   */
  max?: number;
}

/**
 * Placeholder URL used when DATABASE_URL is missing and we are evaluating
 * server modules during a Next 16 production build. `postgres-js` does not
 * open a TCP connection until a query is issued, so it is safe to instantiate
 * the client with this; any attempt to query against it will fail loudly
 * with a clear connection error.
 */
const BUILD_PLACEHOLDER_URL = 'postgres://shamba-build:shamba-build@127.0.0.1:1/shamba-build';

function isBuildPhase(): boolean {
  // Next 16 sets NEXT_PHASE during `next build`. We intentionally do not
  // suppress the missing-URL error at any other time.
  return process.env.NEXT_PHASE === 'phase-production-build';
}

/**
 * Construct a Drizzle client backed by `postgres-js`. Returns a tuple of the
 * Drizzle instance and the underlying `Sql` connection so callers can manage
 * the lifecycle (`await sql.end()`) themselves.
 */
export function createClient(options: CreateClientOptions = {}): {
  db: Database;
  close: () => Promise<void>;
} {
  let url = options.url ?? process.env.DATABASE_URL;
  if (!url) {
    if (isBuildPhase()) {
      url = BUILD_PLACEHOLDER_URL;
    } else {
      throw new Error('DATABASE_URL is required to create a database client');
    }
  }
  const sql = postgres(url, {
    max: options.max ?? 10,
    prepare: false, // Compatible with Vercel Postgres / Neon pgbouncer-style pools.
  });
  const db = drizzle(sql, { schema });
  return {
    db,
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}
