# Contributing to Shamba Traceability

Thank you for your interest in contributing. Shamba Traceability is an open-source agricultural traceability platform on Hedera that helps cooperatives, processors, and exporters prove provenance and comply with regulations such as the EU Deforestation Regulation (EUDR). Every contribution — code, documentation, a translation, a bug report — moves the project forward.

This document is the single source of truth for **how** to contribute. Please read it before opening your first pull request.

---

## Table of contents

- [Code of conduct](#code-of-conduct)
- [What to work on](#what-to-work-on)
- [Development setup](#development-setup)
- [Branching strategy](#branching-strategy)
- [Commit conventions](#commit-conventions)
- [Pull request process](#pull-request-process)
- [Developer Certificate of Origin (DCO)](#developer-certificate-of-origin-dco)
- [Coding standards](#coding-standards)
- [Tests](#tests)
- [Security-sensitive changes](#security-sensitive-changes)
- [Documentation](#documentation)
- [Releases and versioning](#releases-and-versioning)
- [Getting help](#getting-help)

---

## Code of conduct

All participants are expected to follow the [Code of Conduct](./CODE_OF_CONDUCT.md). Be excellent to each other.

## What to work on

- **Good first issues** are tagged `good first issue` in the issue tracker.
- **Help wanted** issues are scoped problems where maintainers welcome external help.
- **Roadmap items** live in the project board and in [`docs/roadmap/`](./docs/roadmap/).
- **Regulatory work** (EUDR article mappings, jurisdiction-specific legality checks) is tracked under the `compliance` label.

Before starting non-trivial work, please open an issue (or comment on an existing one) so a maintainer can confirm scope. This avoids duplicated effort.

## Development setup

Prerequisites:

- **Node.js** 22.x (see [`.nvmrc`](./.nvmrc))
- **pnpm** 9.x
- **Go** 1.23.x (for services in `services/`)
- **Docker** (for local Postgres+PostGIS, IPFS node, mock Hedera network)
- A **Hedera testnet** account (free at <https://portal.hedera.com>) for any change that touches `services/hedera-publisher` or `packages/contracts`

```bash
# Clone and install
git clone https://github.com/Shamba-Records-Limited/traceability.git
cd traceability
pnpm install

# Start the local dev stack
pnpm dev
```

See [`docs/development/`](./docs/development/) for service-specific setup.

## Branching strategy

We use a lightweight trunk-based model:

- `main` is the protected default branch. It is always releasable.
- Work happens on short-lived **feature branches** off `main`.
- Branch names follow the pattern `<type>/<short-kebab-description>` where `<type>` is one of:

  | Prefix      | When to use                                                |
  | ----------- | ---------------------------------------------------------- |
  | `feat/`     | New user-visible feature                                   |
  | `fix/`      | Bug fix                                                    |
  | `chore/`    | Tooling, dependencies, cleanup with no behaviour change    |
  | `docs/`     | Documentation-only change                                  |
  | `refactor/` | Internal restructure with no behaviour change              |
  | `test/`     | Adding or improving tests                                  |
  | `perf/`     | Performance improvement                                    |
  | `ci/`       | CI / GitHub Actions / pipeline change                      |
  | `security/` | Security hardening (use private channel for vulnerabilities) |

  Example: `feat/hedera-publisher-mint-batch`, `fix/dds-empty-polygon`.

- Long-lived branches (`release/x.y`, `lts/x.y`) are reserved for release management and only created by maintainers.

**Direct pushes to `main` are blocked.** Every change lands via pull request.

## Commit conventions

We use [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/). This drives:

- Automated changelog generation.
- Semver-aware release tagging.
- Squash-merge commit messages on `main`.

Format:

```
<type>(<optional scope>): <short summary in imperative mood>

<optional body explaining the why — not the what>

<optional footer(s)>
```

Allowed `<type>` values match the branch prefixes above (`feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `ci`, `security`), plus `build` and `revert`.

Scopes correspond to top-level workspaces or domains, for example:

- `web`, `hedera`, `dds`, `did`, `deforestation`, `types`, `contracts`, `infra`, `docs`, `ci`.

Examples:

```
feat(hedera): publish HCS event on batch handoff
fix(dds): handle plots smaller than 4 ha as geographic points
docs(adr): record decision to use PostGIS for plot geometry
chore(ci): bump golangci-lint to v1.64
```

Breaking changes are marked with `!` after the type/scope **and** a `BREAKING CHANGE:` footer:

```
feat(types)!: rename `BatchId` to `LotId`

BREAKING CHANGE: All public packages and the OpenAPI schema now use `lotId`
instead of `batchId`. Migration guide at docs/migrations/lot-id.md.
```

Commit messages must **not** include AI-tool attribution (no "Co-Authored-By: Claude/Copilot", no "Generated with …" trailers). Authorship belongs to the human contributor who reviewed the change.

## Pull request process

1. Fork the repo (external contributors) or create a feature branch (maintainers).
2. Make your changes in focused, atomic commits.
3. Run `pnpm lint && pnpm test` and the equivalent Go commands for any service you touched.
4. Push your branch and open a PR against `main`.
5. Fill out the PR template completely — especially the **EUDR impact**, **security impact**, and **on-chain schema impact** sections.
6. CI must pass before review.
7. At least one maintainer review is required. Security-sensitive changes require review by a CODEOWNER for that area.
8. PRs are **squash-merged** into `main`. The squash commit message must follow Conventional Commits.
9. Delete the feature branch after merge.

**PR size guideline:** aim for under 400 lines of net change. Larger PRs are accepted when justified (e.g. a new service) but please split where possible.

## Developer Certificate of Origin (DCO)

To contribute, you must certify that you wrote the patch (or otherwise have the right to submit it under the project's licenses). Every commit must be signed off:

```bash
git commit -s -m "feat(web): add cooperative dashboard skeleton"
```

This appends a `Signed-off-by: Your Name <your-email@example.com>` trailer, which is your assertion of the [Developer Certificate of Origin 1.1](https://developercertificate.org/).

By signing off and submitting a contribution, you also agree that **Shamba Records Limited may distribute your contribution under the commercial license** described in [LICENSE-COMMERCIAL.md](./LICENSE-COMMERCIAL.md), in addition to the AGPL-3.0. This is a non-exclusive grant — you retain copyright.

## Coding standards

- **TypeScript:** `pnpm lint` (ESLint + Prettier + `tsc --noEmit`). Strict mode on, no `any` without justification.
- **Go:** `gofmt`, `go vet`, `golangci-lint run`. Tests use the standard library `testing` package; table-driven where it helps clarity.
- **Solidity:** `forge fmt`, `forge build`, `forge test`. Follow the [Solidity style guide](https://docs.soliditylang.org/en/latest/style-guide.html). Use OpenZeppelin contracts where possible.
- **SQL:** snake_case identifiers, every migration file timestamped, every migration reversible.
- **Generated code:** never edit by hand; regenerate via the relevant script and commit the result.

## Tests

- Every behavioural change needs a test. "I tested it manually" is not enough.
- **Unit tests** colocated with the code they cover (`*.test.ts`, `*_test.go`).
- **Integration tests** live in `tests/integration/`. They may spin up Postgres, IPFS, and a local Hedera mock.
- **Contract tests** for Solidity live in `packages/contracts/test/`. Both unit (Foundry) and fork (against Hedera testnet) tests are expected for non-trivial logic.
- **End-to-end** smoke tests for the web app live in `apps/web/e2e/` (Playwright).

## Security-sensitive changes

If your change touches authentication, key custody, smart contracts, on-chain data, GDPR-relevant PII flows, or the DDS submission pipeline:

- Tag the PR with `security` and request a CODEOWNER review.
- Include a brief threat-model note in the PR description (what attacker capability is being added/removed/changed).
- Never include private keys, mnemonics, or production credentials in commits — even in `.env.example` files. Use placeholders.

To report a **vulnerability**, do not open a public issue. Follow the process in [SECURITY.md](./SECURITY.md).

## Documentation

- User-facing docs live in `apps/docs/` (built and deployed alongside the web app).
- Internal architecture lives in `docs/adr/` (Architecture Decision Records) and `docs/architecture/`.
- Regulatory mappings live in `docs/compliance/`.
- Every new public API, CLI flag, or environment variable must be documented before merge.

## Releases and versioning

Shamba Traceability follows [Semantic Versioning 2.0.0](https://semver.org/). Until `1.0.0`, breaking changes may occur in any minor release; they will always be called out in [CHANGELOG.md](./CHANGELOG.md) and in the release notes.

Releases are tagged from `main` (`v0.1.0`, `v0.2.0`, …). The release process is documented in [`docs/development/releasing.md`](./docs/development/releasing.md).

## Getting help

- **General questions:** open a Discussion (once enabled) or an issue with the `question` label.
- **Bug reports:** open an issue using the bug template.
- **Feature requests:** open an issue using the feature template.
- **Commercial enquiries / private support:** legal@shambarecords.com.
- **Security:** security@shambarecords.com (see [SECURITY.md](./SECURITY.md)).

Welcome aboard.
