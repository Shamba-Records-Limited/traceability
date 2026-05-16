# Changelog

All notable changes to Shamba will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Until version `1.0.0` is tagged, breaking changes may occur in any minor release.

## [Unreleased]

### Added

- Initial monorepo scaffold (Turborepo + pnpm workspaces).
- Apps: `web` (Next.js 15 App Router).
- Services: `hedera-publisher` (Go).
- Packages: `shared-types`, `eudr-schema`, `hedera-client`.
- OSS governance: dual AGPL-3.0 + commercial license, contributor guide, code of conduct, security policy, governance model.
- ADRs documenting foundational architecture decisions.
- EUDR compliance mapping document.
- GitHub Actions CI for TypeScript and Go workspaces.
- `services/hedera-publisher`: real Hiero SDK adapter (`internal/hedera/sdk_client.go`) implementing HCS message submission with topic auto-creation, HTS NFT minting with collection auto-creation, and NFT transfers. Replaces the prior placeholder that returned an error when operator credentials were set.
- `services/hedera-publisher`: integration test gated on `HEDERA_INTEGRATION=1` and operator credentials, exercising the real SDK against the configured network.
- `packages/db`: PostgreSQL + PostGIS schema and Drizzle ORM client. Tables for actors, plots (with geography(GEOMETRY, 4326) + GIST index), deforestation_checks, batches, batch_plots, batch_parents, handoffs, and events. Custom Drizzle column type for PostGIS geography. Initial migration auto-enables the postgis extension via a post-generate fix-up script (`scripts/post-generate.mjs`) that's invoked by `pnpm db:generate`.
- `infra/docker/docker-compose.yml`: local dev stack — Postgres 16 + PostGIS 3.4, Redis 7, IPFS Kubo. Health-checked. Exposed on the standard ports.
- Root `package.json` aliases for the database workflow: `pnpm db:up`, `db:down`, `db:logs`, `db:reset`, `db:migrate`, `db:generate`, `db:studio`.
- `docs/development/setup.md`: end-to-end quick-start covering clone, install, docker compose, migrations, Hedera testnet credentials, and common troubleshooting.
- `apps/web`: Auth.js v5 wired with the Drizzle adapter against `@shamba/db`. Email magic-link sign-in via Nodemailer (defaulted at the local Mailpit container), middleware protecting `/dashboard`, sign-in / check-email / dashboard pages, and a `users.actor_id` link to the `actors` table for downstream onboarding. ADR-0006 records the choice over Clerk.
- `apps/web`: onboarding flow at `/onboarding` (role + country + display name + optional subnational). On submit, creates the `actors` row in the same transaction that backfills `users.actor_id`. New users without a profile are routed to onboarding by the dashboard server component; users with a profile see their actor card on the dashboard. Actors are minted with a `did:placeholder:<uuid>` identifier; the upcoming `did-issuer` service rotates it to a real `did:hedera:...` once it lands.
- `packages/db`: Auth.js core tables (`users`, `accounts`, `sessions`, `verificationTokens`) and the `users.actor_id` foreign key to `actors`.
- `infra/docker/docker-compose.yml`: Mailpit container catching outbound SMTP for local Auth.js magic-link development (web UI on :8025, SMTP on :1025).
- `services/did-issuer`: new Go service that mints `did:hedera:<network>:<topicId>` identifiers. Each call creates a dedicated HCS topic and submits an initial W3C DID Core 1.0 document as the topic's first message; subsequent updates ride the same topic. Same mock-vs-real selection rule as `hedera-publisher` (operator credentials present → real mode). `POST /v1/dids/mint` + `/healthz` + `/readyz`. CI Go matrix extended to cover both services.
- `apps/web`: end-to-end plot registration slice — `/dashboard/plots` lists actor-owned plots; `/dashboard/plots/new` captures commodity selection + GeoJSON polygon + country + optional production date range and persists the plot, deforestation check, and `plot_attested` event row in a single transaction. Polygon-vs-point invariant per EUDR Article 9(1)(d) is enforced both server-side (planar area estimator) and at the schema level (`plotSchema.superRefine`). Geometry lands in PostGIS as `geography(*, 4326)` via `ST_GeomFromText`.
- `apps/web/lib/deforestation.ts`: pluggable provider interface with a mock implementation flagged so dashboards can recognise mock-backed decisions. The Global Forest Watch adapter lands as its own PR behind the same interface (per ADR-0004).
- `packages/db`: `events.batch_id` is now nullable and `events.plot_id` is a new FK to `plots`. Lets plot-level events (`plot_attested`, `sample_recorded`) persist before any batch exists. Migration `0002_events_polymorphic_subject.sql`.
- `apps/web/lib/hedera-publisher.ts`: HTTP client for `services/hedera-publisher` that commits canonical event payloads to HCS. Fails soft — on network / timeout / non-2xx it returns `null`, logs a warning, and lets the caller treat the absence of a commitment as deferred work (a reconciler retries later). Configurable via `HEDERA_PUBLISHER_URL` and `HEDERA_PUBLISHER_TIMEOUT_MS`.
- `apps/web/lib/plot.ts`: `registerPlot` now commits the `plot_attested` event to HCS after the DB transaction. On success, backfills `events.on_chain_topic_id`, `sequence_number`, `consensus_timestamp`, `transaction_id` and `plots.on_chain_commitment_topic_id`. Failures stay non-fatal: the plot persists with `on_chain_*` null and the UI surfaces "pending HCS commit".
- `apps/web` `/dashboard/plots`: each plot now shows either a Hashscan link to its HCS topic (when committed) or a "Pending HCS commit" pill (when the publisher was unreachable / mock-skipped).

### Changed

- `apps/web`: upgraded to **Next.js 16** and **eslint-config-next 16**. `typedRoutes` promoted out of `experimental`. The `next lint` subcommand was removed in Next 16; `pnpm --filter @shamba/web lint` now runs `eslint .` directly against a new flat-config `eslint.config.mjs` that imports `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript` as native flat-config modules. The legacy `.eslintrc.json` is gone. ESLint stays on v9 because `eslint-plugin-{import,jsx-a11y,react}` have not yet declared compatibility with ESLint 10; the v10 bump returns to the npm-major migrations tracker (issue #28) when those plugins catch up.
- `packages/shared-types` and `packages/db`: internal imports drop the `.js` extension that Next 16's Turbopack could not resolve against `.ts` source files. The repo convention is now extensionless monorepo-internal imports across the board.
- `packages/db`: `createClient` is build-tolerant — when `process.env.NEXT_PHASE === 'phase-production-build'` and `DATABASE_URL` is missing, it falls back to a clearly-fake placeholder URL so Next 16's build-time page-data collection succeeds without runtime credentials. The placeholder is never connected to in practice; postgres-js opens its socket lazily on first query.
- `services/hedera-publisher`: Go module bumped to `1.25.7` (required by `github.com/hiero-ledger/hiero-sdk-go/v2`).
- CI: `setup-go` action upgraded from Go `1.23` to `1.25`.
- `Dockerfile`: base image upgraded from `golang:1.23-alpine` to `golang:1.25-alpine`.
- `.tool-versions`: `golang` pin bumped to `1.25.7`.
