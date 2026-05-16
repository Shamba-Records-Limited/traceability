# Local development setup

This guide walks you from a fresh clone to a running stack with the database migrated.

## Prerequisites

| Tool    | Version    | Why                                                                            |
| ------- | ---------- | ------------------------------------------------------------------------------ |
| Node.js | 22.x (LTS) | Runtime for the web app and Drizzle migrations. See [`.nvmrc`](../../.nvmrc).  |
| pnpm    | 9.x        | Workspace manager. Pinned in root `package.json` via `packageManager`.         |
| Go      | 1.25.x     | Backend services in `services/`. See [`.tool-versions`](../../.tool-versions). |
| Docker  | 25+        | Local Postgres + PostGIS, Redis, IPFS.                                         |

If you use [asdf](https://asdf-vm.com), `asdf install` in the repo root reads `.tool-versions` and pulls Node, pnpm, and Go in one go.

## First-time setup

```bash
git clone https://github.com/Shamba-Records-Limited/traceability.git
cd traceability

# Install workspace dependencies (Turborepo + every workspace).
pnpm install

# Copy the example environment file. Defaults match the docker-compose stack
# below; adjust if you point at a hosted Postgres or a Hedera mainnet account.
cp .env.example .env.local

# Bring up Postgres + PostGIS, Redis, and IPFS in the background.
pnpm db:up

# Apply the database schema.
pnpm db:migrate
```

That's the floor: Postgres is at `postgres://shamba:shamba@localhost:5432/shamba` (PostGIS pre-loaded), Redis at `redis://localhost:6379`, IPFS API at `http://localhost:5001`.

## Day-to-day commands

| Command                                            | What it does                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm dev`                                         | Run every workspace's `dev` task in parallel (Next.js dev server, Go service watchers if added). |
| `pnpm --filter @shamba/web dev`                    | Just the web app on http://localhost:3000.                                                       |
| `go run ./services/hedera-publisher/cmd/publisher` | Hedera publisher service (mock mode by default; set operator credentials for real mode).         |
| `pnpm typecheck`                                   | Strict TS check across every workspace.                                                          |
| `pnpm lint`                                        | ESLint (Next.js config) on apps.                                                                 |
| `pnpm test`                                        | Vitest + Go tests.                                                                               |
| `pnpm format` / `pnpm format:check`                | Prettier write / verify.                                                                         |

## Database workflow

| Command            | What it does                                                                                                    |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `pnpm db:up`       | Start the local Postgres+PostGIS, Redis, and IPFS containers.                                                   |
| `pnpm db:down`     | Stop the containers (keeps data volumes).                                                                       |
| `pnpm db:reset`    | Stop and **delete data volumes**. Use after a destructive schema change locally.                                |
| `pnpm db:migrate`  | Apply pending Drizzle migrations against `DATABASE_URL`.                                                        |
| `pnpm db:generate` | After editing a Drizzle schema, regenerate `packages/db/drizzle/*.sql`. Auto-runs the PostGIS post-process fix. |
| `pnpm db:studio`   | Open Drizzle Studio against the local database.                                                                 |

After running `pnpm db:generate`, **commit the generated SQL** alongside your schema change.

## Authentication (Auth.js + magic-link)

The web app signs users in via [Auth.js v5](https://authjs.dev) using an email magic-link flow (see [ADR-0006](../adr/0006-authjs-over-clerk.md) for the rationale). Locally, Mailpit catches every outbound email so you don't need a real SMTP service.

1. Generate a session secret and put it in `.env.local`:

   ```bash
   openssl rand -base64 32
   # paste the result as AUTH_SECRET
   ```

2. Confirm the SMTP defaults in `.env.example` match the Mailpit container (`localhost:1025`).
3. Bring up the stack and migrate the database (`pnpm db:up && pnpm db:migrate`).
4. Start the web app: `pnpm --filter @shamba/web dev`.
5. Visit <http://localhost:3000/dashboard> — you'll be redirected to `/sign-in`.
6. Enter any email address and submit; open <http://localhost:8025> to read the magic-link, click it, and you'll land back on the dashboard.

Mailpit captures every send and never delivers anything externally — safe for development.

## Hedera testnet

For real-mode work against `services/hedera-publisher`:

1. Create a free testnet account at <https://portal.hedera.com>.
2. Add the credentials to `.env.local`:

   ```env
   HEDERA_NETWORK=testnet
   HEDERA_OPERATOR_ID=0.0.xxxxxx
   HEDERA_OPERATOR_PRIVATE_KEY=302e0201...
   HEDERA_TREASURY_ID=0.0.xxxxxx
   HEDERA_TREASURY_PRIVATE_KEY=302e0201...
   ```

3. Start the service: `go run ./services/hedera-publisher/cmd/publisher` — startup log should say `mode=real`.

To run the integration tests against real testnet:

```bash
HEDERA_INTEGRATION=1 \
  HEDERA_OPERATOR_ID=... HEDERA_OPERATOR_PRIVATE_KEY=... \
  HEDERA_TREASURY_ID=... HEDERA_TREASURY_PRIVATE_KEY=... \
  go test ./services/hedera-publisher/internal/hedera/...
```

CI does not run those tests.

## Troubleshooting

- **`pnpm install` complains about peer dependencies**: that's expected for some Next plugins; install proceeds.
- **`pnpm db:migrate` says `relation "drizzle_migrations" does not exist`**: drizzle-kit creates it on first run; check that `DATABASE_URL` actually points at your local container (`docker ps` should show `shamba-postgres`).
- **`CREATE EXTENSION postgis` fails**: you're pointing at a Postgres that doesn't bundle PostGIS. Use the local docker-compose stack, or your managed-DB provider's PostGIS toggle.
- **Port 5432/6379/5001 already in use**: another local service is bound. Stop it or override the port mappings in `infra/docker/docker-compose.yml`.

## Next steps

- Read [`docs/architecture/`](../architecture/) for the system overview.
- Read [`docs/adr/`](../adr/) for the rationale behind major decisions.
- Read [`docs/compliance/eudr-mapping.md`](../compliance/eudr-mapping.md) for how features map to the EU Deforestation Regulation.
