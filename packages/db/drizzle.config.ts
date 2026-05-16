import { defineConfig } from 'drizzle-kit';

// `drizzle-kit generate` runs entirely off the schema snapshot and does not
// touch a database; only `push` / `migrate` / `studio` require a live URL.
// We therefore fall back to a placeholder when DATABASE_URL is unset so
// generating SQL stays a zero-credential workflow.
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://localhost/_placeholder_';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
