# Shamba registry contracts

Append-only Solidity registries that mirror the platform's HCS event stream
on Hedera's EVM. Each commitment (`plot_attested`, `batch_created`) lands in
two places:

1. **HCS topic** — fast, cheap, ordered. The system of record for the event
   stream and the audit-trail join key against off-chain payloads.
2. **Registry contract** (this directory) — an idempotent on-chain mapping
   that lets an integrator look up a plot or batch by id without scanning
   topic messages. Useful for ERPs and importer dashboards that already
   speak EVM RPC but do not (yet) have HCS subscribers.

## Contracts

| Contract        | Purpose                     | Key entrypoints                                       |
| --------------- | --------------------------- | ----------------------------------------------------- |
| `PlotRegistry`  | EUDR plot attestation index | `attestPlot(plotId, payloadHash, geometryHash)`       |
| `BatchRegistry` | Batch + lineage edges       | `recordBatch(batchId, payloadHash, parentBatchIds[])` |

Both contracts are append-only. Re-submitting the same id reverts with a
custom error so the off-chain reconciler can retry safely without producing
duplicate events. Authorization is enforced off-chain; both contracts are
intentionally unrestricted on-chain. A future `RegistryAccessControl` can
sit in front of these if per-actor revocation becomes necessary.

## Build and test

Foundry is the toolchain. Install:

```sh
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

The `forge-std` test/script utilities are declared as a git submodule in
`.gitmodules`. After cloning the monorepo, vendor it once:

```sh
cd contracts
forge install foundry-rs/forge-std --no-commit  # or: git submodule update --init --recursive
```

Then build and test:

```sh
forge build
forge test -vvv
```

## Deploy

The repository's deploy script targets Hedera's EVM via JSON-RPC. Set:

```sh
export FOUNDRY_RPC_URL="https://testnet.hashio.io/api"
export PRIVATE_KEY="0x..."  # EVM hex private key of the deployer
```

then:

```sh
forge script script/Deploy.s.sol --rpc-url $FOUNDRY_RPC_URL --broadcast
```

Note the printed EVM addresses, convert them to Hedera `0.0.<num>` IDs via
the mirror node (`GET /api/v1/contracts/<address>`), and paste into the
publisher's `HEDERA_PLOT_REGISTRY_ID` and `HEDERA_BATCH_REGISTRY_ID`
environment variables.

## Architecture decisions

See [`docs/adr/0008-evm-registry-contracts.md`](../docs/adr/0008-evm-registry-contracts.md)
for the rationale behind layering an EVM registry on top of the HCS event
stream and the choice to call it via the native Hedera SDK instead of the
JSON-RPC relay.
