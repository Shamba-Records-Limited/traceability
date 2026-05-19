# ADR 0008: EVM registry contracts on Hedera

- **Status:** Accepted
- **Date:** 2026-05-19
- **Decision drivers:** External integrators expect EVM RPC; Hedera contracts give us idempotent on-chain commitments; the existing HCS topic stream is still the system of record.

## Context

The platform already commits every plot attestation and batch creation to a Hedera Consensus Service topic as an `EventCommitment` (SHA-256 of the off-chain canonical payload, see ADR-0002). HCS is fast, cheap, and gives us total ordering, which is exactly what an audit-trail event log needs.

But integrators (ERPs, importer dashboards, certifiers, competent-authority systems) increasingly expect an **EVM-shaped read surface**: a contract address, an ABI, and an indexed mapping they can query with whatever blockchain plumbing they already have (Ethers, viem, web3.js, Foundry's `cast`). Asking every integrator to consume an HCS topic via the Hiero SDK or the mirror node REST API is a non-trivial integration tax.

We need a second on-chain commitment surface that is EVM-native, lives alongside the HCS stream, and stays a thin idempotent index. The HCS stream remains the **system of record** for the event log; the EVM registry is a denormalised index keyed by application id.

## Decision

Layer two minimal Solidity contracts on top of the HCS commitments:

- **`PlotRegistry.attestPlot(bytes32 plotId, bytes32 payloadHash, bytes32 geometryHash)`** — append-only mapping `plotId -> Attestation { payloadHash, geometryHash, attestedBy, attestedAt }`. Emits `PlotAttested(...)`. Re-attesting the same id reverts with `PlotAlreadyAttested`.
- **`BatchRegistry.recordBatch(bytes32 batchId, bytes32 payloadHash, bytes32[] parentBatchIds)`** — append-only mapping `batchId -> BatchRecord { payloadHash, custodian, recordedAt }`. Emits `BatchRecorded(...)` plus one `BatchLineage(child, parent)` per parent. Double-record reverts with `BatchAlreadyRecorded`.

Both contracts are deliberately **unrestricted on-chain**. Authorization is enforced off-chain — `registerPlot` and `createBatch` in the web layer already assert custodian ownership before calling the publisher. A future `RegistryAccessControl` can sit in front of these if per-actor revocation becomes necessary independently of the actor record.

The contracts are compiled with Foundry (solc 0.8.24, shanghai EVM) and live in `/contracts/`. Deploy with `forge script script/Deploy.s.sol`.

### Wire-up

Three components carry the integration:

1. **`apps/web/lib/registry.ts`** — TypeScript ABI-aware shim. Knows the function selectors (`0xb8efb6cf` for `attestPlot`, `0xa7eef0bb` for `recordBatch`) and parameter encodings; POSTs the encoded calldata to the publisher.
2. **`services/hedera-publisher` `POST /v1/contracts/execute`** — generic contract-exec endpoint accepting `{ contractId, functionSelector, argsHex, gasLimit? }`. Uses the native Hedera SDK's `ContractExecuteTransaction` (NOT the JSON-RPC relay) so the publisher's signing path stays consistent across HCS, HTS, and contracts. Returns the Hedera transaction id + consensus timestamp.
3. **`plots.on_chain_registry_tx_id`** and **`batches.on_chain_registry_tx_id`** (migration 0006) — audit-trail fields backfilled after a successful registry call. `null` means either the registry is disabled in this environment or the call soft-failed; the reconciler can retry pending rows.

### Why the native Hedera SDK, not JSON-RPC?

Hedera exposes an EVM via two paths: native (`ContractExecuteTransaction` over gRPC) or a JSON-RPC relay (HashIO, etc.) that emulates Ethereum semantics. We use the native path because:

- The publisher already pays the operator account in HBAR and signs with a Hedera private key for HCS/HTS. Reusing that signing flow for contracts keeps the trust boundary uniform.
- The native path returns a real Hedera transaction id + consensus timestamp, which joins cleanly against the rest of the audit-trail tables. The JSON-RPC path returns an Ethereum-style tx hash that doesn't natively map back into Hedera coordinates.
- We do NOT need EVM nonces / fee-bumping / standard Ethereum tooling because we control the only writer; the JSON-RPC relay's main value is interoperability with Ethereum-shaped clients, and those clients only need to _read_ our contracts.

Integrators on the read side can use whichever path they prefer — mirror node REST, JSON-RPC relay, or the Hedera SDK. The contract ABI is the canonical interface.

### Activation

The registry is **opt-in** per environment via `REGISTRY_CONTRACTS_ENABLED`. Deployments that haven't yet deployed the contracts can leave it unset and `registerPlot` / `createBatch` skip the registry call cleanly (returning `null`, treating it as a no-op). Once `HEDERA_PLOT_REGISTRY_ID` and `HEDERA_BATCH_REGISTRY_ID` are populated, flipping the flag to `true` activates the writes without further code change.

## Consequences

**Positive**

- Integrators get an EVM-shaped index that's queryable with standard tooling. The mapping is a single-call read by application id (UUID encoded as `bytes32`) — no event-scan required.
- The contracts are idempotent at the storage layer. Reconcilers can safely retry until the call lands, knowing a double-attestation reverts.
- Deployment cost is a one-time small amount of HBAR. Per-call cost is on the order of a fraction of a cent (~30k gas at Hedera's $0.0001/gas pricing). The publisher's operator account pays.
- The contracts pair the HCS event-log surface with an EVM key-value-store surface, addressing different integration needs from a single platform.

**Negative**

- Two on-chain commitments per write instead of one. We accept this because the registry call is opt-in and the same operator pays for both.
- ABI knowledge lives in TypeScript (function selectors, parameter encoding). A change to the Solidity surface requires updating the constants in `apps/web/lib/registry.ts`. We mitigate by keeping the surface small (two functions today) and by hard-coding the selectors so a contract rename forces a code change.
- Solidity testing is via Foundry; the rest of the platform doesn't ship Solidity. Operators that don't want to maintain Foundry can disable `REGISTRY_CONTRACTS_ENABLED` and the platform continues to work on HCS commitments alone.

## Alternatives considered

- **HCS-only, no contracts.** Simpler but leaves EVM-native integrators with no idiomatic read path. Rejected as a permanent posture but is the current default in environments without contracts deployed.
- **Single registry contract covering both plots and batches.** Cheaper to deploy by one transaction but couples two unrelated mappings behind one storage layout. Splitting them gives us per-resource access control later without a migration.
- **Use the JSON-RPC relay instead of the native SDK.** Worse fit for our signing path; covered above.
- **EIP-712 typed-data signatures for off-chain attestation.** Lighter-weight but loses the "indexed on-chain mapping" property that lets integrators look up by id without scanning events.

## References

- ADR-0002 (Hedera service split) — establishes the publisher boundary that this PR reuses.
- ADR-0007 (GFW deforestation provider) — same env-var-gated activation pattern.
- Hedera Smart Contracts documentation: <https://docs.hedera.com/hedera/core-concepts/smart-contracts>.
- Hedera EVM-equivalence: <https://docs.hedera.com/hedera/sdks-and-apis/sdks/smart-contracts/ethereum-virtual-machine-evm>.
