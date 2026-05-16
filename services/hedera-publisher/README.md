# `services/hedera-publisher`

Backend service responsible for writing Shamba Traceability state transitions to Hedera. Specifically:

- Publishes event commitments to Hedera Consensus Service (HCS) topics.
- Mints, transfers, and burns Hedera Token Service (HTS) NFTs that represent lots.
- Calls split / merge / escrow / royalty smart contracts on Hedera EVM where present.

The service is **stateless** apart from an idempotency cache; persistence lives in the platform's Postgres database, called via the web app's API layer.

## Architecture

```
+-------------------+        +---------------------+        +------------+
|  apps/web (BFF)   |  --->  | services/hedera-... |  --->  |   Hedera   |
|  Next.js Route    |        |   (this service)    |        |  (testnet/ |
|  Handler          |        |                     |        |  mainnet)  |
+-------------------+        +---------------------+        +------------+
                                     |
                                     v
                            +-------------------+
                            |   Idempotency     |
                            |   store (Postgres |
                            |   in production)  |
                            +-------------------+
```

## Endpoints

| Method | Path                   | Purpose                                                   |
| ------ | ---------------------- | --------------------------------------------------------- |
| `POST` | `/v1/events`           | Publish a single `EventCommitment` to a batch's HCS topic |
| `POST` | `/v1/batches/mint`     | Mint an HTS NFT for a newly-created batch                 |
| `POST` | `/v1/batches/transfer` | Transfer an HTS NFT (chain-of-custody handoff)            |
| `POST` | `/v1/batches/split`    | Atomic split via contract                                 |
| `POST` | `/v1/batches/merge`    | Atomic merge via contract                                 |
| `GET`  | `/healthz`             | Liveness probe                                            |
| `GET`  | `/readyz`              | Readiness probe (verifies upstream Hedera reachability)   |

All write endpoints accept an `Idempotency-Key` header to allow safe retries.

## Configuration

| Variable                      | Required | Description                                       |
| ----------------------------- | -------- | ------------------------------------------------- |
| `HEDERA_NETWORK`              | yes      | `testnet`, `previewnet`, or `mainnet`             |
| `HEDERA_OPERATOR_ID`          | yes      | Hedera account ID paying for transactions         |
| `HEDERA_OPERATOR_PRIVATE_KEY` | yes      | Private key for the operator account              |
| `HEDERA_TREASURY_ID`          | yes      | Treasury account that holds tokens                |
| `HEDERA_TREASURY_PRIVATE_KEY` | yes      | Private key for the treasury account              |
| `HTTP_PORT`                   | no       | Default `8080`                                    |
| `LOG_LEVEL`                   | no       | `debug`, `info`, `warn`, `error`. Default `info`. |

## Mock mode vs real mode

The service supports two runtime modes, selected automatically by the presence of operator credentials:

| Mode | Trigger                                                                | Behaviour                                                                   |
| ---- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Mock | `HEDERA_OPERATOR_ID` or `HEDERA_OPERATOR_PRIVATE_KEY` empty (default). | Returns deterministic-looking IDs and transaction hashes; no network calls. |
| Real | Both credentials set; treasury credentials also required.              | Signs and submits transactions on the configured network via the Hiero SDK. |

The selection happens in `internal/hedera.NewClient` and is logged at startup.

## Development

```bash
cd services/hedera-publisher

# Mock mode (no testnet account needed).
go run ./cmd/publisher

# Real mode against testnet.
HEDERA_OPERATOR_ID=0.0.1234 \
HEDERA_OPERATOR_PRIVATE_KEY=302e0201... \
HEDERA_TREASURY_ID=0.0.1234 \
HEDERA_TREASURY_PRIVATE_KEY=302e0201... \
go run ./cmd/publisher
```

## Integration tests

Tests in `internal/hedera/*_integration_test.go` are skipped unless **all four** of the following are set (the same set `config.Load()` requires for real mode):

- `HEDERA_INTEGRATION=1`
- `HEDERA_OPERATOR_ID` and `HEDERA_OPERATOR_PRIVATE_KEY`
- `HEDERA_TREASURY_ID` and `HEDERA_TREASURY_PRIVATE_KEY`

When any one of those is missing the tests skip gracefully, so the default `go test ./...` run on a developer machine stays green without testnet access.

```bash
HEDERA_INTEGRATION=1 \
HEDERA_OPERATOR_ID=0.0.1234 \
HEDERA_OPERATOR_PRIVATE_KEY=302e0201... \
HEDERA_TREASURY_ID=0.0.1234 \
HEDERA_TREASURY_PRIVATE_KEY=302e0201... \
go test ./internal/hedera/...
```

CI does not run integration tests by default — they would require committing testnet credentials. A scheduled workflow with repository-scoped secrets can be added in a follow-up PR.
