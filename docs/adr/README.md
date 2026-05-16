# Architecture Decision Records

We record architecturally-significant decisions as ADRs so future contributors can understand **why** the system is the way it is, not just what it does.

## When to write an ADR

Write an ADR when a decision:

- Is hard to reverse (data model, on-chain schema, choice of network);
- Spans multiple components or affects external contracts;
- Closes off plausible alternatives that a reasonable future contributor might re-propose;
- Has compliance, legal, or security implications.

## Format

We use a lightweight format derived from [Michael Nygard's original proposal](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions). Each ADR is a markdown file under `docs/adr/` named `NNNN-kebab-title.md`.

Template:

```markdown
# NNNN. Decision title

- **Status:** Proposed | Accepted | Deprecated | Superseded by ADR-XXXX
- **Date:** YYYY-MM-DD
- **Deciders:** @handle1, @handle2

## Context

What is the issue we are addressing? What constraints exist?

## Decision

What did we decide? State it as a single, clear sentence followed by detail.

## Consequences

What becomes easier? What becomes harder? What new risks or work follow from this decision?

## Alternatives considered

What did we evaluate and reject, and why?
```

## Index

ADRs are listed by number; check this directory for the canonical, up-to-date list.

- [0001 — Monorepo with Turborepo and pnpm](./0001-monorepo-with-turborepo.md)
- [0002 — Hedera service split: HCS + HTS + selective EVM contracts](./0002-hedera-service-split.md)
- [0003 — Identity via Hedera DID and W3C Verifiable Credentials](./0003-identity-did-vc.md)
- [0004 — PostGIS for plot geometry and spatial queries](./0004-postgis-for-plot-geometry.md)
- [0005 — Dual licensing: AGPL-3.0 plus commercial](./0005-dual-licensing.md)
- [0006 — Auth.js v5 over Clerk for authentication](./0006-authjs-over-clerk.md)
