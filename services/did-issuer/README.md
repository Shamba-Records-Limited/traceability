# `services/did-issuer`

Backend service that mints W3C-compliant `did:hedera` decentralised identifiers for Shamba actors, per [ADR-0003](../../docs/adr/0003-identity-did-vc.md).

Each minted DID is anchored on its own Hedera Consensus Service (HCS) topic. The initial DID document is submitted as the topic's first message. Subsequent updates (key rotation, deactivation) are future messages on the same topic.

## Endpoints

| Method | Path            | Purpose                                                              |
| ------ | --------------- | -------------------------------------------------------------------- |
| `POST` | `/v1/dids/mint` | Create an HCS topic, submit the initial DID document, return the DID |
| `GET`  | `/healthz`      | Liveness probe                                                       |
| `GET`  | `/readyz`       | Readiness probe (verifies upstream Hedera reachability)              |

### `POST /v1/dids/mint`

Request:

```json
{
  "actorId": "11111111-1111-4111-8111-111111111111",
  "displayName": "Acme Cooperative"
}
```

Response:

```json
{
  "did": "did:hedera:testnet:0.0.5829471",
  "topicId": "0.0.5829471",
  "transactionId": "0.0.1234@1715865600.123456789",
  "documentVersion": 1
}
```

The caller (typically the web app's onboarding action) is responsible for persisting the returned `did` into the `actors.did` column.

## Mock mode vs real mode

Same selection rule as `hedera-publisher`:

| Mode | Trigger                                                                | Behaviour                                                               |
| ---- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Mock | `HEDERA_OPERATOR_ID` or `HEDERA_OPERATOR_PRIVATE_KEY` empty (default). | Returns deterministic IDs; no network calls.                            |
| Real | Both credentials set; treasury credentials also required.              | Creates a real HCS topic, submits the DID document, returns the result. |

## Configuration

| Variable                      | Required        | Description                                       |
| ----------------------------- | --------------- | ------------------------------------------------- |
| `HEDERA_NETWORK`              | yes             | `testnet`, `previewnet`, or `mainnet`             |
| `HEDERA_OPERATOR_ID`          | yes (real mode) | Hedera account ID paying for transactions         |
| `HEDERA_OPERATOR_PRIVATE_KEY` | yes (real mode) | Private key for the operator account              |
| `HEDERA_TREASURY_ID`          | yes (real mode) | Treasury account (currently unused but reserved)  |
| `HEDERA_TREASURY_PRIVATE_KEY` | yes (real mode) | Private key for the treasury account              |
| `HTTP_PORT`                   | no              | Default `8081`                                    |
| `LOG_LEVEL`                   | no              | `debug`, `info`, `warn`, `error`. Default `info`. |

## Development

```bash
cd services/did-issuer

# Mock mode (no testnet account needed).
go run ./cmd/issuer

# Real mode against testnet.
HEDERA_OPERATOR_ID=0.0.1234 \
HEDERA_OPERATOR_PRIVATE_KEY=302e0201... \
HEDERA_TREASURY_ID=0.0.1234 \
HEDERA_TREASURY_PRIVATE_KEY=302e0201... \
go run ./cmd/issuer
```

## Integration tests

Tests in `internal/hedera/*_integration_test.go` are skipped unless `HEDERA_INTEGRATION=1` and all four credential variables are set, matching the publisher service's contract.

## Future scope (not in this PR)

- Per-actor key pairs with HSM-backed signing for self-custody users.
- DID document updates (key rotation, deactivation).
- A background reconciler that scans `actors` for `did:placeholder:*` rows and mints real DIDs in the background.
- Sharing the Hedera client wrapper with `services/hedera-publisher` via a shared internal module.
