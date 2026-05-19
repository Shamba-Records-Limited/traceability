# EUDR Compliance Mapping

This document maps the requirements of **Regulation (EU) 2023/1115** — the EU Deforestation Regulation (EUDR) — to specific features of Shamba Traceability. It is the canonical reference auditors, integrators, and downstream operators should consult to understand what the platform provides and where the operator's own responsibilities remain.

> **Status:** Living document. EUDR application dates and the European Commission's implementing guidance continue to evolve. We update this mapping in the same PR as any code change that affects a requirement, and at least quarterly.

> **Last reviewed:** 2026-05-16.

## How to read this document

For each EUDR article, we record:

- **Requirement** — a plain-language summary of what the regulation asks for.
- **Operator's responsibility** — what the operator (the EU-importing business) must do itself.
- **Platform feature** — what Shamba Traceability provides to help the operator meet the requirement, including the relevant subsystem.
- **Status** — `Implemented`, `In progress`, `Planned`, or `Out of scope`.

This document is not legal advice. Operators remain responsible for their own due diligence and for verifying that the platform's outputs satisfy their competent authority.

---

## Scope: Article 1 and Article 2

**Requirement.** EUDR applies to seven relevant commodities — cattle, cocoa, coffee, oil palm, rubber, soya, and wood — and to a list of relevant products derived from them (Annex I). Operators placing relevant products on the EU market or making them available, and traders that are not SMEs, are subject to due-diligence obligations.

**Platform feature.** Shamba Traceability is **commodity-agnostic** with explicit first-class support for all seven Annex I commodities. The data model accommodates upstream production (plot-level), midstream processing (lot transformations), and downstream placement (shipments, customs entry).

**Status.** In progress (first MVP slice prioritises coffee, cocoa, and cattle; extension to oil palm, rubber, soya, and wood follows immediately afterwards).

---

## Definitions: Article 3

We adopt the regulation's definitions verbatim in our type system. Key terms — `Operator`, `Trader`, `Placing on the market`, `Making available on the market`, `Production`, `Deforestation`, `Forest degradation`, `Plot of land`, `Geolocation`, `Relevant commodity`, `Relevant product`, `Country of production` — map to fields and roles in `packages/shared-types`.

**Status.** Implemented (type definitions track the regulation's terminology).

---

## Article 4 — Obligations of operators

**Requirement.** An operator may only place a relevant product on the EU market or export it if it is deforestation-free, has been produced in accordance with the relevant legislation of the country of production, and is covered by a Due Diligence Statement (DDS).

**Operator's responsibility.** The operator submits the DDS through the EU information system (TRACES NT) before the product is placed on the market. The operator's reference number for the DDS must accompany the shipment.

**Platform feature.**

- `services/dds-generator` produces a DDS that conforms to the schema published by the European Commission, ready for submission.
- `services/dds-generator` includes a configurable adapter for direct submission to TRACES NT, where the operator has API credentials.
- The web app surfaces the DDS reference number and ensures it is attached to the shipment record and the consumer-facing QR page.

**Status.** Generator: in progress (planned for first MVP slice). TRACES NT direct submission: planned as adapter (Phase 2).

---

## Article 5 — Obligations of traders

**Requirement.** Non-SME traders carry the same due-diligence obligations as operators. SME traders must collect and retain information about their suppliers and customers for at least five years.

**Platform feature.**

- The actor model distinguishes between operators, large traders, and SME traders, applying the right workflow.
- Audit trails (immutable HCS event logs plus off-chain queryable database) preserve the supplier/customer information for the required retention period.

**Status.** Implemented (data model); workflow UI in progress.

---

## Article 8 — Due Diligence System

**Requirement.** Operators and non-SME traders must establish and operate a due-diligence system covering the three steps in Articles 9–11.

**Platform feature.** Shamba Traceability provides a complete due-diligence system as a service:

- **Step 1** — Information collection at every supply-chain handoff (Article 9).
- **Step 2** — Risk assessment workflow (Article 10).
- **Step 3** — Risk mitigation workflow (Article 11).

**Status.** Architecture in place; full UI/workflow in progress.

---

## Article 9 — Information requirements

This is the most operationally significant article for our platform. Operators must collect, for each batch:

| Sub-paragraph | Information required                                                                                                                                       | Platform feature                                                                                                                                                                                                                                                                                                                                                                                                                                         | Status            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| (a)           | Description, including trade name and type of product                                                                                                      | `batches.commodity` enum + `batches.processing_stage`; required at batch creation via `createBatch` in `apps/web/lib/batch.ts`. Surfaced in DDS and consumer QR.                                                                                                                                                                                                                                                                                         | In progress       |
| (b)           | Quantity (net mass and/or volume, number of items)                                                                                                         | `batches.quantity` + `batches.unit` (kg / tonne / head / m3). Required at batch creation and validated as a positive finite number.                                                                                                                                                                                                                                                                                                                      | In progress       |
| (c)           | Country (and parts of country) of production                                                                                                               | `plots.country` + `plots.subnational` aggregated through `batch_plots` to the batch. The custodian can only attach plots they own, so the aggregation is authoritative without additional input.                                                                                                                                                                                                                                                         | In progress       |
| (d)           | **Geolocation of all plots of land**: polygon for plots > 4 ha, points for plots <= 4 ha. WGS 84 coordinates.                                              | `Plot.geometry` stored as `GEOGRAPHY(POLYGON / POINT, 4326)` per ADR-0004. Validation enforces the 4 ha threshold and rejects malformed geometries. Hash of geometry committed on HCS at registration.                                                                                                                                                                                                                                                   | In progress       |
| (e)           | Date or time range of production                                                                                                                           | `batches.production_start` + `batches.production_end`. Required at batch creation, validated end >= start.                                                                                                                                                                                                                                                                                                                                               | In progress       |
| (f)           | Name, postal address, email of suppliers                                                                                                                   | `Actor` records with role-specific schemas; resolved through the chain-of-custody graph via `handoffs.from_actor_id` for each previous custodian.                                                                                                                                                                                                                                                                                                        | In progress       |
| (g)           | Name, postal address, email of operators/traders to which the product was supplied                                                                         | Two-party handoff flow in `apps/web/lib/handoff.ts`: sender proposes, receiver accepts. Each transition emits a `handoff_proposed` / `handoff_received` event committed to HCS. When both actors have a Hedera account id on file the HTS NFT transfers on-chain at acceptance via the publisher's `/v1/batches/transfer`. Off-chain ledger remains authoritative; on-chain transfer is deferred to a follow-up reconciler when account ids are missing. | In progress       |
| (h)           | Adequately conclusive and verifiable information that the products are deforestation-free                                                                  | Plot-level deforestation check against pluggable provider with a real Global Forest Watch adapter (Hansen Global Forest Change, 30% canopy threshold, year >= 2021) selected via `DEFORESTATION_PROVIDER=gfw`. Fail-closed: provider unavailability refuses registration rather than silently attesting. Result + per-year loss breakdown persisted in `deforestation_checks.raw` for auditor verification. See ADR-0007.                                | In progress       |
| (i)           | Adequately conclusive and verifiable information that the products have been produced in accordance with relevant legislation of the country of production | Per-country **legality module** with configurable checklists for land tenure, labour, tax, anti-corruption, trade, anti-money-laundering, customs, and environmental law (per the regulation). Evidence attached as VCs.                                                                                                                                                                                                                                 | Planned (Phase 2) |

**Status (overall):** In progress. The first MVP slice covers (a)–(h); (i) ships as the legality module in Phase 2.

---

## Article 10 — Risk assessment

**Requirement.** Operators must assess, for each batch, the risk of non-compliance based on the information collected. The regulation lists specific criteria operators must consider: country risk classification, presence of forests, presence of indigenous peoples, prevalence of forest degradation, source supplier complexity, mixing with unknown-origin material, and others.

**Platform feature.** A guided risk-assessment workflow that:

- Pulls the country risk classification from the **EU country classification list** (when the Commission publishes it) or from a configurable default per operator until then.
- Surfaces every criterion in Article 10 as a checklist item with a recorded answer and supporting evidence.
- Computes an aggregate risk indicator (Low / Standard / High) and persists it in the DDS.

**Status.** Architecture defined; UI workflow in progress.

---

## Article 11 — Risk mitigation

**Requirement.** Where risk is non-negligible, operators must apply mitigation measures (additional information, surveys, independent audits, capacity building) until risk is reduced to "no or negligible".

**Platform feature.** A risk-mitigation workflow that:

- Lets the operator attach mitigation actions to a batch, with status tracking.
- Generates a mitigation report that is included in the DDS bundle.
- Supports re-running the risk assessment after mitigation actions are completed.

**Status.** Planned (Phase 2, immediately after Article 9 + 10 implementation).

---

## Article 12 — Simplified due diligence (low-risk countries)

**Requirement.** For commodities and products sourced from countries (or parts of countries) classified as **low risk** by the Commission, operators may apply a simplified due-diligence procedure (skip Articles 10 and 11), provided they have no information suggesting non-compliance.

**Platform feature.** Per-batch workflow detects when all source plots are in low-risk jurisdictions and offers the simplified path, with an audit-logged rationale. Operators may override and run full due diligence regardless.

**Status.** Planned. Depends on publication of the EU country classification list.

---

## Article 13–22 — Competent authorities, checks, sanctions

These articles concern Member State competent authorities and their enforcement. Operators interact with them; the platform's role is to **make compliance demonstrable**. Specifically:

- Read-only export of full traceability bundles per shipment (Article 16 checks support).
- Tamper-evident on-chain commitments backing every event.
- Long-term retention (default 10 years; configurable).

**Status.** Architecture in place; export tooling in progress.

---

## Article 23 — Information system (TRACES NT)

**Requirement.** DDSs are submitted through the EU information system TRACES NT.

**Platform feature.** `services/dds-generator` includes a TRACES NT adapter (per ADR for DDS submission) that submits the DDS on the operator's behalf using the operator's credentials. Until then, operators upload the generated DDS JSON/PDF manually.

**Status.** Generator: in progress. Direct adapter: planned (Phase 2).

---

## Article 27 — Country risk classification

**Requirement.** The Commission classifies countries (or parts of countries) as low / standard / high risk.

**Platform feature.** Country and subnational risk classifications are a versioned reference dataset in the platform, refreshed when the Commission publishes updates. Risk assessments cite the version used so historic decisions remain reproducible.

**Status.** Schema defined; first dataset import will follow the Commission's publication.

---

## Article 36 / Article 38 — Application dates

| Date             | Applies to                                                        |
| ---------------- | ----------------------------------------------------------------- |
| 30 December 2025 | Operators and traders that are **not** micro or small enterprises |
| 30 June 2026     | Operators and traders that **are** micro or small enterprises     |

The platform is being built to be production-ready well in advance of both dates. We track any further amendments to the application dates here in the same commit that any code change is made.

---

## Related compliance documents

- [`gdpr.md`](./gdpr.md) — General Data Protection Regulation alignment (off-chain PII, on-chain commitments).
- [`country-legality-matrix.md`](./country-legality-matrix.md) — Per-country legality checklist (Article 9(1)(i)).
- [`certifications.md`](./certifications.md) — Voluntary scheme integration (Fairtrade, Rainforest Alliance, Organic, etc.).

## Change log

| Date       | Change                                                                            |
| ---------- | --------------------------------------------------------------------------------- |
| 2026-05-16 | Initial mapping committed alongside monorepo scaffold (`feat/scaffold-monorepo`). |
