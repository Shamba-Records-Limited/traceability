# Shamba Traceability

> Open-source, EUDR-aligned agricultural traceability platform built on the Hedera network.
> Multi-commodity. Blockchain-native. From plot to shelf.

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](./LICENSE)
[![Commercial license](https://img.shields.io/badge/commercial%20license-available-green)](./LICENSE-COMMERCIAL.md)
[![Status: 0.1.0](https://img.shields.io/badge/status-0.1.0%20release-blue)](#status)
[![EUDR](https://img.shields.io/badge/EUDR-Regulation%202023%2F1115-yellow)](./docs/compliance/eudr-mapping.md)

A project of [Shamba Records Limited](https://shambarecords.com).

---

## Why

Agricultural supply chains are opaque. Cooperatives, processors, and exporters carry the regulatory and reputational risk of proving provenance, while the data needed to back those claims is fragmented across paper records, spreadsheets, and proprietary systems.

The EU Deforestation Regulation (EUDR, **Regulation (EU) 2023/1115**) raises the bar dramatically: by **30 December 2025** for large operators and **30 June 2026** for SMEs, every relevant commodity placed on the EU market must be backed by a verifiable Due Diligence Statement, including plot-level geolocation, deforestation status against a 31 December 2020 cut-off, and country-of-production legality. Comparable rules are emerging in the UK, the US, and elsewhere.

Shamba Traceability provides the open, blockchain-anchored substrate operators need to meet that bar — and to make supply-chain integrity a public good rather than a proprietary moat.

## Who it's for

- **Cooperatives and aggregators** registering farmers, capturing plot polygons, and recording deliveries in the field.
- **Processors** reconciling intake, tracking transformations, and preserving lineage across splits and merges.
- **Exporters** preparing EUDR Due Diligence Statements and submitting them via TRACES NT.
- **EU importers** verifying upstream provenance before placing products on the market.
- **Auditors and competent authorities** consuming tamper-evident traceability bundles.
- **Consumers** scanning a QR code on a bag of coffee or a chocolate bar to see the journey.

## What's in the box

- **Plot registration** with WGS 84 polygons (or points for plots <= 4 ha), area validation, and on-chain commitment.
- **Pluggable deforestation checks** against the 2020 cut-off, with Global Forest Watch as the default provider.
- **Batch tokenization** as Hedera Token Service (HTS) NFTs, with full split / merge semantics.
- **Tamper-evident event log** on Hedera Consensus Service (HCS) — one topic per batch, per-event commitment hashes.
- **Chain-of-custody handoffs** between farm -> cooperative -> processor -> exporter -> EU importer, with optional on-chain escrow.
- **Decentralised identity** via `did:hedera` and W3C Verifiable Credentials for actors and certifications.
- **EUDR Due Diligence Statement** generation (JSON + PDF) and a configurable TRACES NT submission adapter.
- **Consumer-facing QR pages** linking to public proof on Hashscan.
- **Auditor portal** with read-only access and export bundles.

See [`docs/roadmap/`](./docs/roadmap/) for status and what's next.

## Repository layout

```
apps/         User-facing applications (Next.js web app, docs site)
services/     Backend services in Go (Hedera publisher, deforestation, DDS, DID)
packages/     Shared TypeScript packages (types, schemas, smart contracts)
infra/        Local-dev compose, Vercel config, DB migrations
docs/         ADRs, architecture, EUDR compliance mapping, threat models
.github/      CI workflows, issue/PR templates, CODEOWNERS, dependabot
```

## Architecture at a glance

```
+----------------------+        +-----------------------+        +----------+
|  apps/web (Next.js)  |  --->  |  services/* (Go)      |  --->  |  Hedera  |
|  Cooperative + EU    |        |  hedera-publisher     |        |  HCS     |
|  portals,            |        |  deforestation        |        |  HTS     |
|  consumer QR         |        |  dds-generator        |        |  EVM     |
|                      |        |  did-issuer           |        +----------+
+----------+-----------+        +-----------+-----------+
           |                                |
           v                                v
   +---------------+               +------------------+
   |   Postgres +  |               |  IPFS / Filecoin |
   |   PostGIS     |               |  (evidence,      |
   |   (Neon)      |               |   DDS PDFs)      |
   +---------------+               +------------------+
```

For the design rationale, see the Architecture Decision Records under [`docs/adr/`](./docs/adr).

## Tech stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript 5.7, Tailwind CSS, shadcn-style components.
- **Backend services**: Go 1.23, standard library HTTP, distroless container images.
- **Smart contracts**: Solidity on Hedera EVM (Foundry).
- **Data**: PostgreSQL + PostGIS (via Neon on the Vercel Marketplace), Redis (via Upstash).
- **Storage**: IPFS (evidence, DDS PDFs, signed VC payloads).
- **Identity**: Hedera DID (`did:hedera`) + W3C Verifiable Credentials.
- **Deploy**: Vercel for `apps/web`; container hosts for Go services. Configured via `vercel.ts`.
- **Tooling**: Turborepo, pnpm, Vitest, `go test`, golangci-lint, ESLint, Prettier.

## Status

Pre-alpha. The repository contains foundational scaffolding and architecture; the first end-to-end traceability slice is being built on `feat/*` branches. We track progress in [`docs/roadmap/`](./docs/roadmap/) and in [`CHANGELOG.md`](./CHANGELOG.md).

## Local development

> Requires Node 22, pnpm 9, Go 1.23, and Docker.

```bash
git clone https://github.com/Shamba-Records-Limited/traceability.git
cd traceability

# Install workspace dependencies.
pnpm install

# Run the web app.
pnpm --filter @shamba/web dev

# Run the Hedera publisher service (mock mode by default).
go run ./services/hedera-publisher/cmd/publisher
```

Detailed setup, including a local Postgres+PostGIS+IPFS stack via Docker, lives in [`docs/development/setup.md`](./docs/development/setup.md).

## Documentation

| Topic                               | Path                                                                   |
| ----------------------------------- | ---------------------------------------------------------------------- |
| Architecture Decision Records       | [`docs/adr/`](./docs/adr/)                                             |
| System architecture overviews       | [`docs/architecture/`](./docs/architecture/)                           |
| EUDR mapping (Regulation 2023/1115) | [`docs/compliance/eudr-mapping.md`](./docs/compliance/eudr-mapping.md) |
| Development guides                  | [`docs/development/`](./docs/development/)                             |
| Threat models                       | [`docs/threat-model/`](./docs/threat-model/)                           |
| Roadmap                             | [`docs/roadmap/`](./docs/roadmap/)                                     |

## License

Shamba Traceability is dual-licensed:

- **Open-source**: [GNU Affero General Public License v3.0](./LICENSE) (AGPL-3.0).
- **Commercial**: alternative terms are available from Shamba Records Limited — see [`LICENSE-COMMERCIAL.md`](./LICENSE-COMMERCIAL.md).

The brand name _Shamba_ and associated marks are trademarks of Shamba Records Limited and are not granted under either licence.

## Contributing

Contributions are welcome. Please read:

- [`CONTRIBUTING.md`](./CONTRIBUTING.md) for branch and commit conventions, DCO sign-off, and review process.
- [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) — we follow the Contributor Covenant.
- [`GOVERNANCE.md`](./GOVERNANCE.md) for how decisions are made.
- [`SECURITY.md`](./SECURITY.md) before reporting any vulnerability.

## Maintained by

Shamba Traceability is maintained by [Shamba Records Limited](https://shambarecords.com) and a growing community. See [`MAINTAINERS.md`](./MAINTAINERS.md) for the current maintainer list and [`AUTHORS.md`](./AUTHORS.md) for acknowledgements.

Contact: hello@shambarecords.com — security@shambarecords.com — conduct@shambarecords.com.
