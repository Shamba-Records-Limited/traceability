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

### Changed

- `services/hedera-publisher`: Go module bumped to `1.25.7` (required by `github.com/hiero-ledger/hiero-sdk-go/v2`).
- CI: `setup-go` action upgraded from Go `1.23` to `1.25`.
- `Dockerfile`: base image upgraded from `golang:1.23-alpine` to `golang:1.25-alpine`.
- `.tool-versions`: `golang` pin bumped to `1.25.7`.
