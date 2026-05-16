# Project Governance

This document describes how Shamba Traceability is governed: who makes which decisions, how they are made, and how the structure can evolve as the community grows.

## 1. Mission

Shamba Traceability provides open, auditable, blockchain-anchored traceability infrastructure for agricultural commodities. The project exists to:

- Lower the cost of compliance with regulations such as the EU Deforestation Regulation (EUDR);
- Give producers — especially smallholder cooperatives — the ability to prove provenance, sustainability, and legality;
- Make the data primitives of agri-supply-chain integrity a public good rather than a proprietary moat.

Every governance decision should be evaluated against this mission.

## 2. Stewardship

The project is **stewarded** by Shamba Records Limited (Kenya). Stewardship means:

- Holding the trademark and the commercial licence (see [LICENSE-COMMERCIAL.md](./LICENSE-COMMERCIAL.md));
- Operating shared infrastructure (CI runners, package registries, demo deployments);
- Funding maintainers, security audits, and regulatory tracking;
- Convening the maintainer team and acting as a tie-breaker on irresolvable disputes.

Stewardship is **not** unilateral control. Day-to-day technical direction is set by the maintainer team described below, and the project is committed to evolving toward more independent governance as the community matures (see Section 8).

## 3. Roles

### 3.1 Contributors

Anyone who opens an issue, comments substantively, submits a pull request, helps with translations, writes documentation, or otherwise improves the project. No nomination required — contributing is the qualification.

### 3.2 Reviewers

Contributors with a track record of high-quality reviews who have been granted permission to review and approve pull requests in a specific area of the codebase. Reviewers are listed in [`CODEOWNERS`](./.github/CODEOWNERS) for the areas they cover. Nominated by any maintainer; confirmed by maintainer-team consensus.

### 3.3 Maintainers

Contributors with merge rights on the repository. Maintainers are responsible for:

- Reviewing and merging pull requests within their area;
- Triaging issues;
- Cutting releases;
- Upholding this governance document and the [Code of Conduct](./CODE_OF_CONDUCT.md).

The full list is maintained in [`MAINTAINERS.md`](./MAINTAINERS.md). New maintainers are nominated by an existing maintainer and confirmed by **lazy consensus** (see Section 5) over a seven-day window.

### 3.4 Steward representatives

Shamba Records Limited appoints up to two representatives who participate as maintainers and additionally:

- Sign off on trademark use;
- Approve commercial licence terms;
- Vote in tie-breakers.

Steward representatives count toward maintainer quorum but do not by themselves have unilateral override on technical decisions.

### 3.5 Security response team

A subset of maintainers, plus optionally external advisors, who handle vulnerability reports per [SECURITY.md](./SECURITY.md). Membership is published in [`MAINTAINERS.md`](./MAINTAINERS.md).

## 4. Areas

The codebase is divided into **areas** that match the top-level workspace layout. Each area has a CODEOWNER who is the primary reviewer for changes within it:

| Area                        | Description                                          |
| --------------------------- | ---------------------------------------------------- |
| `apps/web`                  | Next.js web application                              |
| `services/hedera-publisher` | Hedera HCS/HTS publishing service                    |
| `services/deforestation`    | Deforestation-check service and provider adapters    |
| `services/dds-generator`    | EUDR Due Diligence Statement generator               |
| `services/did-issuer`       | Hedera DID + W3C Verifiable Credentials issuer       |
| `packages/contracts`        | Solidity smart contracts on Hedera EVM               |
| `packages/shared-types`     | Shared types and Zod schemas                         |
| `packages/eudr-schema`      | EUDR DDS JSON schema                                 |
| `infra`                     | Local dev compose, Vercel config, deployment scripts |
| `docs`                      | Architecture, ADRs, compliance mappings              |
| `.github`                   | CI workflows, repository policies                    |

Cross-area changes require approval from each affected area's CODEOWNER.

## 5. Decision-making

Most decisions are made by **lazy consensus** on a pull request or issue:

- A change is proposed.
- It is reviewed by the relevant area's CODEOWNERS.
- If no one objects within a reasonable window (typically 48–72 hours for routine changes, seven days for substantive ones), the change is approved.

When lazy consensus fails — i.e. an objection is raised and not resolved through discussion — the decision escalates:

1. **Technical disagreement within an area** → resolved by the area's CODEOWNERS by simple majority.
2. **Architectural / cross-area disagreement** → resolved by a maintainer vote (simple majority of voting maintainers, quorum of three).
3. **Tie or principled deadlock** → broken by a steward representative, after a written rationale is published on the relevant issue.

Decisions of architectural significance must be captured in an Architecture Decision Record under [`docs/adr/`](./docs/adr/).

## 6. Releases

Releases are cut from `main` by any maintainer using the release process in [`docs/development/releasing.md`](./docs/development/releasing.md). The project follows [Semantic Versioning](https://semver.org/).

Until `1.0.0`, breaking changes may occur in any minor release; after `1.0.0`, breaking changes require a major version bump and a deprecation window of at least one prior minor release where feasible.

## 7. Conduct and enforcement

All participants are bound by the [Code of Conduct](./CODE_OF_CONDUCT.md). Enforcement decisions are made by the Code of Conduct response team (any two maintainers, one of whom must be a steward representative) and may be appealed to the full maintainer team.

## 8. Evolution

This governance model is intentionally lightweight. As the community grows, the project commits to evolving toward more independent governance — for example, by joining a foundation (Linux Foundation, OpenSSF, or a regional equivalent), establishing an elected technical steering committee, or formalising a separate trademark policy.

Changes to this document are proposed via a pull request labelled `governance` and require approval from a majority of maintainers **and** at least one steward representative.

## 9. Trademarks

"Shamba", "Shamba Records", "Shamba Traceability", and the Shamba logo are trademarks of Shamba Records Limited. The AGPL-3.0 licence covers the source code; it does **not** grant trademark rights. Forks of the project must rename and rebrand to avoid implying endorsement.

## 10. Contact

Governance questions: governance@shambarecords.com.
