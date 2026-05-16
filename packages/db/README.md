# `@shamba/db`

PostgreSQL + PostGIS schema and Drizzle ORM client for Shamba Traceability. The schema mirrors the Zod contracts in [`@shamba/shared-types`](../shared-types/) and is the single source of truth at the persistence layer.

Why PostGIS: see [ADR-0004 — PostGIS for plot geometry and spatial queries](../../docs/adr/0004-postgis-for-plot-geometry.md).

## Module layout

| Path                    | Purpose                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `src/schema/`           | One file per domain table (actors, plots, batches, handoffs, events, deforestation_checks). |
| `src/schema/columns.ts` | Custom Drizzle `geography` and `polygon-geography` column types backed by PostGIS.          |
| `src/client.ts`         | `postgres-js` connection factory.                                                           |
| `src/migrate.ts`        | One-shot migration runner used by `pnpm db:migrate`.                                        |
| `drizzle/`              | Generated SQL migrations (committed).                                                       |
| `drizzle.config.ts`     | drizzle-kit configuration.                                                                  |

## Local dev workflow

```bash
# From the repo root
docker compose -f infra/docker/docker-compose.yml up -d
cp .env.example .env.local        # adjust DATABASE_URL if needed

pnpm install
pnpm --filter @shamba/db db:migrate
```

To regenerate migrations after editing schema:

```bash
pnpm --filter @shamba/db db:generate
git add packages/db/drizzle/
```

To open the Drizzle Studio against the local database:

```bash
pnpm --filter @shamba/db db:studio
```

## Geometry conventions

- All plot geometries are stored as `geography(*, 4326)` (WGS 84) per EUDR Article 9(1)(d).
- Polygons (plots > 4 ha) use `geography(POLYGON, 4326)`; points (plots ≤ 4 ha) use `geography(POINT, 4326)`.
- A `GIST` index is created on every geometry column.

## Testing

`@shamba/db` itself has no logic worth unit-testing yet; integration tests against an ephemeral Postgres run live in `tests/integration/` (added in a follow-up PR).
