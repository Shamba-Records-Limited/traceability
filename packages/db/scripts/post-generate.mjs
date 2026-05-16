// Drizzle-kit emits PostGIS column types as quoted identifiers
// (e.g. "geography(GEOMETRY, 4326)") because it does not recognise PostGIS as
// a known type family. Postgres then tries to look up a type literally named
// `geography(GEOMETRY, 4326)` which doesn't exist. This script unquotes those
// declarations and ensures every migration that uses geography columns also
// enables the postgis extension before the first reference.
//
// Idempotent: re-running it on already-fixed SQL is a no-op.

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const migrationsDir = join(here, '..', 'drizzle');

const POSTGIS_PREAMBLE = `-- Enable PostGIS in the target database. The PostGIS docker image ships with
-- the extension pre-loaded into template1, but managed services (Neon, Supabase,
-- RDS) require this statement on a per-database basis. Idempotent.
CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint\n`;

const QUOTED_GEOGRAPHY = /"(geography\([^"]+\))"/g;

async function fixFile(path) {
  const original = await readFile(path, 'utf8');
  let fixed = original.replace(QUOTED_GEOGRAPHY, '$1');
  if (fixed.includes('geography(') && !fixed.includes('CREATE EXTENSION IF NOT EXISTS postgis')) {
    fixed = POSTGIS_PREAMBLE + fixed;
  }
  if (fixed !== original) {
    await writeFile(path, fixed);
    return true;
  }
  return false;
}

const entries = await readdir(migrationsDir);
const sqlFiles = entries.filter((name) => name.endsWith('.sql')).sort();

let touched = 0;
for (const name of sqlFiles) {
  const path = join(migrationsDir, name);
  if (await fixFile(path)) {
    touched += 1;
    console.log(`fixed ${name}`);
  }
}

if (touched === 0) {
  console.log('no fixes needed');
}
