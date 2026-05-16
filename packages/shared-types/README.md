# `@shamba/shared-types`

Shared domain types and Zod schemas for Shamba Traceability.

Zod schemas are the source of truth. TypeScript types are derived from them via `z.infer<>`. Where a JSON Schema is needed for Go services or external tooling, it is generated via `zod-to-json-schema` and committed under `dist/schemas/`.

## Modules

| Module       | Exports                                                                            |
| ------------ | ---------------------------------------------------------------------------------- |
| `common`     | Primitive scalars: `Hash`, `Iso8601`, `Uuid`, brand types, helpers                 |
| `commodity`  | EUDR Annex I commodities and their units of measure                                |
| `geometry`   | GeoJSON-shaped `Point` and `Polygon` types (WGS 84)                                |
| `identity`   | `Did`, `VerifiableCredential`, key reference types                                 |
| `actor`      | Farmer, Cooperative, Processor, Exporter, Importer, Auditor schemas               |
| `plot`       | Plot of land with geometry, owner reference, and certifications                    |
| `batch`      | A traceable unit of commodity at a point in time                                   |
| `handoff`    | Chain-of-custody transfers between actors                                          |
| `event`      | The on-chain (HCS) event vocabulary                                                |
| `dds`        | EUDR Due Diligence Statement structure                                             |

## Usage

```ts
import { plotSchema, type Plot } from '@shamba/shared-types';

const parsed = plotSchema.parse(userInput);
// `parsed` is now typed as `Plot`.
```

Importing from sub-paths is also supported, e.g. `import { plotSchema } from '@shamba/shared-types/plot'`.
