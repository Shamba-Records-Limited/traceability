/**
 * One-shot migration runner. Invoked by `pnpm --filter @shamba/db db:migrate`.
 *
 * Runs all pending migrations in `./drizzle/` against the database pointed to
 * by `DATABASE_URL`, then exits. Failures bubble up as non-zero exits so CI
 * can pick them up.
 */
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required to run migrations');
  }

  const sql = postgres(url, { max: 1 });
  try {
    const db = drizzle(sql);
    const here = dirname(fileURLToPath(import.meta.url));
    const migrationsFolder = resolve(here, '..', 'drizzle');
    await migrate(db, { migrationsFolder });
    console.log(`migrations applied from ${migrationsFolder}`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error('migration failed', error);
  process.exit(1);
});
