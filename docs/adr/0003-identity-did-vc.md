# 0003. Identity via Hedera DID and W3C Verifiable Credentials

- **Status:** Accepted
- **Date:** 2026-05-16
- **Deciders:** @developerkevo

## Context

Every actor in an agricultural supply chain — farmer, cooperative, processor, exporter, EU importer, auditor — needs a stable identity that:

- Can sign attestations (a handoff happened, a sample passed, a certification was granted) in a way that is independently verifiable.
- Survives the actor moving between cooperatives, employers, or jurisdictions.
- Carries credentials (membership, certifications, training) issued by trusted parties.
- Does not bind the user to a single platform — the EUDR ecosystem will eventually involve many traceability systems, and a portable identity is essential for interoperability.

Traditional username/password identity is none of these. A platform-internal user ID is none of these. We need decentralised identifiers (DIDs) and verifiable credentials (VCs).

Hedera publishes an open specification for the `did:hedera` method, anchored on HCS. The Decentralized Identity Foundation and the W3C have standardised the VC data model.

## Decision

1. **Every actor receives a `did:hedera` identifier** on first registration. The DID document is anchored on a dedicated HCS topic.

2. **Credentials are issued as W3C Verifiable Credentials.** Examples:
   - "X is a member of Y cooperative" (issued by the cooperative).
   - "Z holds Rainforest Alliance certification" (issued by RA).
   - "DDS-12345 was generated for shipment S and accepted by competent authority CA" (issued by the exporter, countersigned by us).

3. **Key custody is hybrid.** By default, signing keys for actor DIDs are held in our HSM-backed relayer (see ADR-0002), so users do not need to manage cryptographic material. Power users (exporters, auditors) may opt into self-custody using a hardware wallet or a mobile DID wallet that supports the Hedera DID method.

4. **Authentication is layered.** Off-chain authentication uses passkeys + email/OTP via a managed identity provider (Clerk is the current candidate, behind a Vercel Marketplace integration). Once authenticated, the user's session is bound to their DID, and signed actions emit appropriate VC presentations or HCS commitments.

5. **Privacy is preserved by selective disclosure.** When an actor needs to prove something about themselves (e.g. that they hold a certification valid for the destination market), they present a VC or a derived ZK-style selective-disclosure proof, not their full DID document. PII never leaves the off-chain database.

## Consequences

Easier:

- External auditors and EU competent authorities can verify our attestations without integrating with our APIs.
- Cooperatives' membership records become portable; if a cooperative dissolves, members keep their DIDs.
- Certification bodies can issue credentials directly to actors, with us as a relay rather than a gatekeeper.
- The system composes with future EUDR-related infrastructure that adopts DID/VC standards.

Harder:

- We must operate at least one HCS topic for DID anchoring, with careful key management.
- VC issuance and verification add code surface and a learning curve for new contributors.
- The hybrid custody model means we own a real cryptographic obligation: an HSM, rotation policy, break-glass procedure, and incident playbook.

Risk:

- **Loss of access to a custodial signing key** — mitigated by HSM, multi-region replication, and an explicit recovery flow tied to the actor's authenticated identity.
- **DID method evolution** — `did:hedera` is still maturing. We will pin to a specific method version per ADR-able decision; we accept that we may need to migrate to a successor method one day.

## Alternatives considered

- **Platform-internal user IDs with no DIDs.** Cheapest. Rejected because it ties every consumer of our data to our platform; we want our attestations to be verifiable by anyone, anywhere.
- **`did:web` (DNS-rooted DIDs).** Simple. Rejected because it ties identities to domains we control; loses portability.
- **`did:key` (ephemeral DIDs).** Simple. Rejected because there is no key rotation path; key compromise is permanent identity loss.
- **`did:ethr`, `did:ion`, or other public-chain methods.** Reasonable. Rejected because we are committed to Hedera (per ADR-0002) and want consistency.
- **No VCs; ad-hoc signed JSON.** Rejected because we would reinvent VC tooling badly. The W3C VC ecosystem already solves issuance, revocation, status lists, and presentation.
