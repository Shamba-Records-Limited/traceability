# 0006. Auth.js v5 over Clerk for authentication

- **Status:** Accepted
- **Date:** 2026-05-16
- **Deciders:** @developerkevo

## Context

Shamba Traceability needs authentication for cooperative field officers, processors, exporters, auditors, and (eventually) a self-service portal for individual farmers. ADR-0003 commits us to `did:hedera` plus W3C Verifiable Credentials as the canonical identity layer; that ADR also calls out a layered model where day-to-day session authentication is decoupled from on-chain identity:

> Authentication is layered. Off-chain authentication uses passkeys + email/OTP via a managed identity provider (Clerk is the current candidate, behind a Vercel Marketplace integration). Once authenticated, the user's session is bound to their DID, and signed actions emit appropriate VC presentations or HCS commitments.

This ADR revisits that "current candidate" once we actually need to ship the layer, weighed against the project's open-source posture (AGPL-3.0 + commercial dual licence, [ADR-0005](./0005-dual-licensing.md)).

## Decision

Use **Auth.js v5** (the framework formerly published as NextAuth.js) for off-chain authentication, with the Drizzle adapter pointed at `@shamba/db`.

Auth.js takes responsibility for:

- Session management (secure HTTP-only cookies, JWT or database sessions).
- Email magic-link sign-in (the default first-party provider in Auth.js v5).
- OAuth provider plumbing (GitHub, Google, etc.) when we need it.
- Standard CSRF protection and callback URL validation.

The DID layer remains unchanged from ADR-0003: a separate service issues a `did:hedera` for every actor on first sign-in, and signed actions reference that DID via VCs and HCS commitments. Auth.js sessions carry the actor's database id; the DID is fetched from `actors` as needed.

## Consequences

Easier:

- Zero third-party signup required to run the stack locally — contributors can use the `nodemailer` provider against the bundled Mailpit container or any local SMTP server, or the Auth.js dev-only Credentials provider.
- The whole authentication surface is open-source (`MIT` licensed), so no vendor lock-in or contractual asymmetry against our AGPL-3.0 code.
- One source of truth at the database layer: Auth.js's `users`, `accounts`, `sessions`, and `verificationTokens` tables live in `@shamba/db` alongside `actors`, with a foreign key from `users.actor_id` -> `actors.id` once onboarding picks a role.
- Standard adapter pattern means we can swap providers (passkeys, GitHub OAuth, enterprise SAML) without touching the actor model.

Harder:

- We ship slightly more code than a Clerk integration would (custom sign-in page, magic-link template, session callbacks).
- Email delivery is on us — a Resend / SendGrid / Postmark / SMTP integration must be configured per-environment.
- Passkey support requires a provider package; Auth.js has one but it's still beta as of this writing.

Risk:

- **Auth.js v5 is in beta as of writing.** API surface is stable enough but minor releases may require adjustments. Mitigated by pinning to an exact `next-auth` version (no caret range) in `apps/web/package.json` and revisiting on each upgrade.
- **Magic-link UX for high-volume cooperative field officers** may friction if they share devices. We will offer an OAuth (GitHub) provider for technical users and a passkey provider as soon as it goes GA.

## Alternatives considered

- **Clerk via the Vercel Marketplace.** Easiest possible integration — sign-in/up UI, passkeys, social login, and user management all out of the box. Rejected because it ties every operator to Clerk's pricing and TOS; we cannot ship a fully-open deployment and the asymmetry sits awkwardly against the AGPL-3.0 core. Re-evaluate if we ever offer a hosted edition where Shamba Records Limited bears Clerk's billing.
- **Lucia (formerly Lucia-auth).** Excellent ergonomics. Maintainer announced sunset of the framework portion in 2024 in favour of a "build your own" guide; not a viable foundation for new code.
- **Better-Auth.** Newer entrant, framework-agnostic, growing adoption. Rejected for this slice because the Drizzle adapter and provider catalogue are less mature; reconsider in 12 months.
- **Roll our own.** Always tempting. Rejected because session management, CSRF protection, magic-link replay-attack prevention, and OAuth state handling are areas where library-level battle-testing matters more than custom-fit code.

## Notes

The DID layer remains the responsibility of `services/did-issuer` (placeholder until its own PR). When that lands, Auth.js's `events.signIn` callback will trigger DID issuance for new actors; the DID is then persisted on the `actors` row that Auth.js's session is bound to.
