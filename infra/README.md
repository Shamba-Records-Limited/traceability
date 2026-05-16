# `infra/`

Everything that describes how Shamba Traceability is built and run.

| Subdirectory | Purpose                                                                            |
| ------------ | ---------------------------------------------------------------------------------- |
| `docker/`    | Local development stack: Postgres + PostGIS, Redis, IPFS, mock Hedera mirror node  |
| `vercel/`    | `vercel.ts` and environment variable templates for Vercel deployments              |
| `db/`        | SQL migrations and seed data (managed by Drizzle or sqlc; choice tracked in ADR)   |

Production infrastructure is provisioned via the deployment platform's primitives (Vercel for web, container hosts for Go services). We deliberately do not check Terraform state into this repo.
