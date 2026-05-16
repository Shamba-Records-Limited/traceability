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

### Changed

- `services/hedera-publisher`: Go module bumped to `1.25.7` (required by `github.com/hiero-ledger/hiero-sdk-go/v2`).
- CI: `setup-go` action upgraded from Go `1.23` to `1.25`.
- `Dockerfile`: base image upgraded from `golang:1.23-alpine` to `golang:1.25-alpine`.
- `.tool-versions`: `golang` pin bumped to `1.25.7`.
