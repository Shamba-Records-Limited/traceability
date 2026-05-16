# 0004. PostGIS for plot geometry and spatial queries

- **Status:** Accepted
- **Date:** 2026-05-16
- **Deciders:** @developerkevo

## Context

Plot geometry is central to Shamba Traceability:

- EUDR Article 9(1)(d) requires geolocation of every plot of land where the commodity was produced. Plots larger than 4 hectares must be expressed as polygons; smaller plots may be expressed as points.
- We must run **deforestation checks** that intersect plot polygons with forest-loss raster or vector layers (Global Forest Watch, JRC, Sentinel-derived).
- We must support **plot-level audit queries** ("show me every plot intersecting protected area X") and **regional analytics** ("average yield per hectare by district").
- Smallholder cooperatives often have hundreds to thousands of plots; we expect millions of plots at scale.

We need first-class geospatial primitives: polygons, points, projections, spatial indexes, and integrations with the wider GIS ecosystem.

## Decision

We will use **PostgreSQL with the PostGIS extension** as the primary store for plot geometry and all spatial queries. Specifically:

- Plot polygons are stored as `GEOGRAPHY(POLYGON, 4326)` columns (WGS 84, the EUDR-mandated reference system).
- Plot points (sub-4-hectare plots) are stored as `GEOGRAPHY(POINT, 4326)`.
- Spatial indexes (`GIST` or `SPGIST`) are created on all geometry columns.
- Plot area is computed and stored at write time (and recomputed on update) so it is queryable without a function call.
- Cross-layer analyses (deforestation, protected areas) are run by importing the relevant reference layers as PostGIS tables when feasible, or by calling external APIs for layers we do not host (per ADR on deforestation provider).
- Migrations and schema management are handled by Drizzle ORM (TypeScript) for the web app's data access; the Go services use generated types via `sqlc` to keep query performance predictable.

We will host PostgreSQL via the Vercel Marketplace integration with Neon. Neon supports PostGIS natively and provides branching, which is useful for our local-dev and preview-deployment flows.

## Consequences

Easier:

- All spatial logic lives in a database the team already knows.
- Tooling ecosystem (QGIS, ogr2ogr, mapping libraries) interoperates out of the box.
- Auditors can be given read-only Postgres replicas for ad-hoc verification.

Harder:

- Operational cost rises with the size of imported reference layers; we will be selective about what is hosted vs called via API.
- Schema migrations need to handle spatial indexes carefully (rebuilds can be expensive on large tables).
- Backups must include geometry data; we cannot use logical replication tricks that drop extensions.

Risk:

- **Vendor lock-in to Neon.** Mitigated by standard Postgres + PostGIS; any provider that supports PostGIS will accept a backup.
- **Performance regressions** on large datasets if we forget to add spatial indexes. Mitigated by a migration template that requires an index declaration on every geometry column.

## Alternatives considered

- **A standalone GIS engine (GeoServer, MapServer).** Powerful but overkill for our query patterns; we do not need OGC compliance for serving styled map tiles to clients (yet).
- **A document database with GeoJSON fields (MongoDB).** Has 2dsphere indexes. Rejected because we want SQL joins between plots, batches, actors, and certifications; modelling that in a document store is awkward at our scale.
- **Pure on-chain storage of polygons.** Rejected — far too expensive for non-trivial polygons; the chain is not the right primitive for spatial queries.
- **A separate vector tile store (TippeCanoe + S3).** We will use this later for serving styled maps to the web app, but it complements PostGIS rather than replacing it.
