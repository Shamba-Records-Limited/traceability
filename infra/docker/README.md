# Local development stack

Docker Compose definition for the services Shamba Traceability talks to during local development:

| Service            | Image                           | Default URL                                                  |
| ------------------ | ------------------------------- | ------------------------------------------------------------ |
| Postgres + PostGIS | `postgis/postgis:16-3.4-alpine` | `postgres://shamba:shamba@localhost:5432/shamba`             |
| Redis              | `redis:7-alpine`                | `redis://localhost:6379`                                     |
| IPFS (Kubo)        | `ipfs/kubo:v0.32.1`             | API `http://localhost:5001`, gateway `http://localhost:8080` |

## Quick start

From the repository root:

```bash
# Start everything in the background.
pnpm db:up

# Tail logs (Ctrl+C to detach without stopping).
pnpm db:logs

# Stop without removing data.
pnpm db:down

# Wipe everything and start fresh.
pnpm db:reset
```

The `pnpm db:*` aliases live in the root `package.json`. They wrap `docker compose` against this file.

## After starting

Apply the database schema:

```bash
pnpm --filter @shamba/db db:migrate
```

(Or `pnpm db:migrate` once the root alias is wired.)

## Notes

- The `ipfs` service is optional. Comment it out in `docker-compose.yml` if you don't need it during day-to-day development.
- The PostGIS image preloads the `postgis` extension into `template1`, so freshly-created databases get it automatically. The migration also runs `CREATE EXTENSION IF NOT EXISTS postgis` for safety against managed-database deployments where this isn't pre-loaded.
- Production deployment relies on managed services (Neon for Postgres, Upstash for Redis); see `docs/development/setup.md` for cloud configuration.
