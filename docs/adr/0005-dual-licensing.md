# 0005. Dual licensing: AGPL-3.0 plus commercial

- **Status:** Accepted
- **Date:** 2026-05-16
- **Deciders:** Shamba Records Limited (steward), @developerkevo

## Context

We want Shamba Traceability to be a public good for the agricultural supply chain — open code, open data models, verifiable by anyone. At the same time, the project requires sustained engineering effort: full-time maintainers, security audits, EUDR regulatory tracking, Hedera infrastructure operations. We need a licence that delivers both:

- **Strong copyleft for the open ecosystem.** If someone runs a modified version of Shamba Traceability as a hosted service, the improvements should flow back. Otherwise commercial forks can free-ride on community work without contributing.
- **A commercial path** for organisations that genuinely cannot adopt a copyleft licence (closed-source product integrations, white-labelling, indemnified deployments).

Permissive licences (MIT, Apache-2.0) fail the first requirement. Pure AGPL-3.0 fails the second. Dual licensing addresses both.

## Decision

Shamba Traceability is dual-licensed:

1. **Default:** GNU Affero General Public License v3.0 (AGPL-3.0). This is the licence under which the source is published. The verbatim text is in `LICENSE`. The full terms apply to anyone who clones, modifies, or operates a network-accessible version of the software.

2. **Alternative:** A commercial licence offered by Shamba Records Limited, available under separate written agreement. Terms summarised in `LICENSE-COMMERCIAL.md`.

Contributors agree, by signing off their commits (DCO), that Shamba Records Limited may also distribute their contribution under the commercial licence. This is a non-exclusive grant; contributors retain copyright.

The brand "Shamba", the logo, and related marks are trademarks of Shamba Records Limited and are explicitly **not** covered by the AGPL-3.0. Forks must rebrand.

## Consequences

Easier:

- Cooperatives, NGOs, government agencies, and individual developers can adopt the software freely.
- Improvements made by anyone running a hosted version must be shared back, growing the commons.
- A revenue path exists for sustaining the project.
- The trademark policy prevents confusing forks.

Harder:

- We need a DCO sign-off on every commit and clear contributor documentation.
- We need to actually offer the commercial licence: contracts, support tiers, an inbound contact channel, a way to bill.
- Some potential contributors will not contribute to dual-licensed projects on principle. We accept this cost.

Risk:

- **Misalignment between maintainers and steward** on commercial-licence terms. Mitigated by the governance model (see `GOVERNANCE.md`), which requires steward representation to be balanced with community maintainership and which prohibits unilateral commercial terms that contradict project direction.
- **Licence confusion at adoption time.** Mitigated by clear `README` language and a top-level `LICENSE-COMMERCIAL.md` summarising the alternative.

## Alternatives considered

- **MIT or Apache-2.0 only.** Permissive but invites closed-source SaaS forks that drain community contributions. Rejected.
- **AGPL-3.0 only.** Strong copyleft but blocks legitimate commercial adopters who would otherwise pay. Rejected.
- **Business Source Licence (BSL) with eventual transition to Apache-2.0.** Considered: aligns incentives, but BSL is not OSI-approved and would weaken the "open-source" positioning we want for advocacy and procurement. Rejected.
- **Elastic Licence 2.0 / Server Side Public Licence.** Both have explicit "may not provide as a service" carve-outs but are not OSI-approved. Rejected.
- **Commons Clause overlay.** Same problem: not OSI-approved. Rejected.

## Notes

We reserve the right to relicense future contributions under a different OSI-approved licence (for example, transitioning to a foundation-managed Apache-2.0 governance) by following the process in `GOVERNANCE.md`. Such a change would not retroactively re-licence past contributions without consent from their authors.
