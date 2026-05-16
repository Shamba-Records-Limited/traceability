# `packages/`

Shared TypeScript packages consumed by `apps/` and (where helpful, via JSON Schema generation) by Go services.

| Package          | Purpose                                                                       |
| ---------------- | ----------------------------------------------------------------------------- |
| `shared-types`   | Domain types and Zod schemas (Actor, Plot, Batch, Handoff, Event, DDS)        |
| `hedera-client`  | Thin TypeScript wrapper around `@hashgraph/sdk` for browser- and edge-safe use |
| `eudr-schema`    | EUDR Due Diligence Statement JSON Schema and TypeScript types                  |
| `contracts`      | Solidity smart contracts targeting Hedera EVM (Foundry-based)                  |

Every package publishes types and a runtime entry point. ESM-only, `"type": "module"`, ESNext target.
