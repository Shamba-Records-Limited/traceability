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
