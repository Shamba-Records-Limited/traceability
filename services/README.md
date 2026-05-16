# `services/`

Backend services. Each service is a self-contained Go module with its own `go.mod`, lifecycle, and deployment target. Services are not pnpm workspaces.

| Service            | Stack   | Purpose                                                               |
| ------------------ | ------- | --------------------------------------------------------------------- |
| `hedera-publisher` | Go 1.23 | Publishes HCS events, mints/transfers HTS tokens, handles idempotency |
| `deforestation`    | Go 1.23 | Pluggable provider interface; GFW adapter by default                  |
| `dds-generator`    | Go 1.23 | Builds EUDR Due Diligence Statements (JSON + PDF); TRACES NT adapter  |
| `did-issuer`       | Go 1.23 | Issues `did:hedera` identifiers and W3C Verifiable Credentials        |

Why Go? Concurrency-heavy batch processing (deforestation polygon checks, DDS rendering, HCS publishing) is a natural fit, and the Hedera Go SDK is first-class. Services expose HTTP/gRPC APIs consumed by `apps/web`.
