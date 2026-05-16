# Compliance

This directory holds the durable mapping between **what regulations require** and **how Shamba Traceability meets that requirement**. It is the reference auditors and integrators consult.

| Document                               | Scope                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------ |
| [`eudr-mapping.md`](./eudr-mapping.md) | EU Regulation 2023/1115, article-by-article, to system features          |
| `gdpr.md`                              | Lawful basis, retention, data-subject rights, off-chain commitments      |
| `country-legality-matrix.md`           | Per-country legality checklist required by EUDR Article 9(1)(h)          |
| `certifications.md`                    | Integration approach for Fairtrade, Organic, Rainforest Alliance, others |

Each document is versioned with the regulation it tracks. When a regulation is amended, the corresponding mapping is updated in the same PR that ships any necessary code change, with a `compliance` label.
