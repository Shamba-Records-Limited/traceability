# 0002. Hedera service split: HCS + HTS + selective EVM contracts

- **Status:** Accepted
- **Date:** 2026-05-16
- **Deciders:** @developerkevo

## Context

Shamba Traceability must record agricultural commodity provenance in a way that is:

- **Tamper-evident** — any change to a recorded event can be detected.
- **Independently verifiable** — auditors, EU competent authorities, and end consumers can confirm provenance without trusting Shamba Records Limited.
- **Affordable** — per-transaction cost must be a small fraction of the commercial value of the lot it covers, especially for smallholder-scale batches.
- **Privacy-respecting** — personal data of farmers and field staff cannot live on a public ledger (GDPR, Kenya DPA, etc.).
- **Composable** — third parties should be able to verify and build on the data without integrating tightly with our platform.

Hedera offers three primitives that map well to these needs:

1. **Hedera Consensus Service (HCS)** — a public-key-authenticated, timestamped, ordered append-only log. Per-message cost ~$0.0001 (USD). Ideal for high-volume event streams.
2. **Hedera Token Service (HTS)** — native non-fungible (NFT) and fungible token issuance with on-protocol metadata. No contract gas; deterministic fees.
3. **Hedera Smart Contract Service (HSCS)** — EVM-compatible smart contracts. Highest cost and complexity, but allows arbitrary logic.

Each primitive has trade-offs. The question is how to split responsibilities across them.

## Decision

We will use a **hybrid topology**:

1. **HCS for event logs.** Each batch gets a dedicated HCS topic. Every state transition (created, sampled, certified, transferred, split, merged, exported, received, settled) is written as a hash-committed message on the topic. The off-chain database stores the canonical event with full payload; the on-chain message carries the commitment, the actor's DID-derived signature, and a content-addressable pointer (IPFS CID) for any associated evidence.

2. **HTS NFTs for lots.** Each distinct lot (a quantum of commodity that is meaningful to handle as a unit) is represented as an HTS NFT. The NFT metadata pointer references an immutable JSON document on IPFS containing the lot's provenance, certifications, and a pointer to the batch's HCS topic. Lot ownership transfers (handoffs) are HTS transfers.

3. **HTS fungible tokens for bulk commodity units (optional, commodity-by-commodity).** Some commodities (green coffee, beef, soy) are commercially handled in fungible quantities after a certain step in the chain. Where this is the case, we can mint a commodity-specific fungible token. The NFT representing the upstream lot is burned (or marked exhausted) when its mass is converted into fungible token supply. This trade-off — losing batch identity for fungibility — is taken consciously and recorded in the HCS log so the downstream owner can still trace back.

4. **Smart contracts for selective logic only.** We will deploy contracts on Hedera EVM for three specific cases:

   - **Split / merge atomicity** — splitting one lot NFT into N children, or merging M lots into one, must be atomic with the appropriate burn/mint and event emission. A contract gives us this atomicity in one transaction.
   - **Handoff escrow** — locking payment until physical receipt is confirmed by the receiver's signature. Reduces counterparty risk for cooperatives selling to distant exporters.
   - **Payment splitting / royalties** — paying out a percentage of a sale to upstream actors (farmers, cooperatives) based on a previously declared split.

   Everything else stays off-contract.

5. **Treasury / relayer pattern.** Farmers, cooperatives, and field officers do not hold HBAR or sign on-chain transactions directly. A Shamba-operated treasury account pays for HCS and HTS transactions; users authenticate to our platform off-chain, and we sign on their behalf with attribution via a Verifiable Credential (see ADR-0003). This avoids forcing every cooperative to manage a crypto wallet.

## Consequences

Easier:

- Provenance recording is cheap enough to run at smallholder scale (per-event cost dwarfed by commodity value).
- Off-chain database stays authoritative for queries; on-chain commitments are the audit trail.
- Auditors can independently verify any specific claim by hashing the off-chain record and comparing to the HCS message.
- No personal data on chain; only commitments.
- We can deprecate or evolve contracts independently of the event log.

Harder:

- Operational responsibility for the treasury / relayer (key management, top-up monitoring, abuse prevention).
- Three Hedera services to integrate against; the publisher service must orchestrate them coherently.
- Splitting and merging requires careful schema design so that downstream owners can always reconstruct upstream lineage.
- We need to track per-environment topic IDs and token IDs in configuration; an ID for testnet does not work on mainnet.

Risk:

- **Treasury account compromise** would let an attacker impersonate any user. Mitigated by HSM-backed key custody, per-action signing policies, and clear rate limits. Detailed in the threat model (`docs/threat-model/on-chain.md`).
- **Contract bugs** in split/merge or escrow could lock funds or lots. Mitigated by audits before mainnet deployment, upgrade paths via OpenZeppelin proxies (where appropriate to Hedera EVM), and conservative deployment cadence.

## Alternatives considered

- **HCS only.** Cheapest and simplest. Rejected because exporters want a recognisable, transferable digital object (NFT) for each lot; an HCS event stream alone is harder to integrate with downstream systems.
- **Full smart-contract model on Hedera EVM.** Most flexible. Rejected because of cost, complexity, and the absence of a strong reason to put the entire event stream inside a contract when HCS gives us better semantics at a lower price.
- **Off-chain database with periodic notarisation to a public chain.** Cheap to operate. Rejected because the per-event audit trail is the product; reducing it to a periodic root weakens verification by external parties.
- **Other public chains (Ethereum L1, an L2, Polygon, etc.).** Hedera was selected by stewardship as the target network. ADR not re-opened here.
