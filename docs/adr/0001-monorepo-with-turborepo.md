# 0001. Monorepo with Turborepo and pnpm

- **Status:** Accepted
- **Date:** 2026-05-16
- **Deciders:** @developerkevo

## Context

Shamba Traceability spans several deployable units that share types, schemas, and protocol definitions:

- A web application for cooperatives, processors, exporters, auditors, and consumers.
- Multiple backend services (Hedera publisher, deforestation checker, DDS generator, DID issuer).
- Solidity smart contracts for Hedera EVM.
- Documentation, schemas, and infrastructure as code.

These units evolve together. A change to the on-chain event vocabulary, for example, needs to touch the smart contracts, the Hedera publisher service, the shared types package, and the web app in one coherent change. A polyrepo would force this kind of work into a coordinated multi-PR dance across repositories, with version mismatches and stale clients as the failure mode. A monorepo lets a single PR change everything it needs to and gives the reviewer a coherent picture.

We also want one CI pipeline, one issue tracker, one set of release tags, and one place where contributors land. For a project at our current stage, that consolidation is more valuable than the per-component ownership boundaries a polyrepo would provide.

## Decision

We will use a single Git monorepo, with workspace orchestration via:

- **pnpm** as the package manager and workspace driver for the TypeScript portion (`apps/*`, `packages/*`).
- **Turborepo 2.x** as the build pipeline, providing task graphs, remote caching, and parallel execution.

Go services under `services/*` are **not** pnpm workspaces; each has its own `go.mod`. Turbo orchestrates them via shell tasks where helpful, but their lifecycle is independent.

## Consequences

Easier:

- Cross-cutting changes land in one PR with one CI run.
- Shared types and schemas can be consumed by any TypeScript workspace without publishing.
- Code search, refactoring, and review are uniform across the codebase.
- Onboarding requires cloning one repo.

Harder:

- Build times grow linearly with workspaces unless Turbo caching is well-configured.
- CI must be careful to run only the tests affected by a change (Turbo's `--filter` and the `dorny/paths-filter` action handle this).
- We must be disciplined about clean dependency direction (apps may depend on packages; packages may not depend on apps; services may consume packages via JSON Schema export).

## Alternatives considered

- **Polyrepo (one repo per app/service/package).** Rejected: too much coordination cost for the small team and the highly coupled domain. Reconsider when independent ownership becomes a bottleneck.
- **Monorepo without Turborepo (just pnpm workspaces).** Rejected: we want caching and a task graph from day one. Adding Turbo later is possible but disruptive.
- **Nx instead of Turborepo.** Considered: more features but more conceptual overhead. Turbo is sufficient for our needs and has a lighter footprint.
- **Hybrid: TS monorepo + separate Go monorepo.** Rejected: shared schemas between TS and Go would need a third repo or a complex publishing flow. Co-locating them simplifies the contract.

## Notes

If Go services ever outgrow being co-located — for example, because they are taken in by other organisations as standalone components — we will split them out and treat this repo as a federation. That is a future-us problem.
