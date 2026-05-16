import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema/index.js';

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
 * Construct a Drizzle client backed by `postgres-js`. Returns a tuple of the
 * Drizzle instance and the underlying `Sql` connection so callers can manage
 * the lifecycle (`await sql.end()`) themselves.
 */
export function createClient(options: CreateClientOptions = {}): {
  db: Database;
  close: () => Promise<void>;
} {
  const url = options.url ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required to create a database client');
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
