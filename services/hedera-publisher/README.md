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

## Development

```bash
cd services/hedera-publisher
go run ./cmd/publisher
```

The service starts in **mock mode** by default (no real Hedera calls) until the SDK adapter is wired in a follow-up PR.
