# Architecture

High-level system documentation. ADRs in [`../adr/`](../adr) record specific decisions; this directory holds living overviews.

| Document                | Audience                                              |
| ----------------------- | ----------------------------------------------------- |
| `overview.md`           | New contributors — the 30-minute orientation          |
| `data-model.md`         | Anyone touching the schema or domain types            |
| `on-chain-topology.md`  | Anyone touching `services/hedera-publisher` or contracts |
| `event-flow.md`         | End-to-end traceability event lifecycle               |
| `security-model.md`     | Trust boundaries, key custody, threat surfaces        |

These documents are kept short, current, and link-dense. When something changes in the system, the architecture doc changes in the same PR.
