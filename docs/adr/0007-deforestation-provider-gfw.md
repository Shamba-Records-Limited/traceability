# ADR 0007: Global Forest Watch as the default EUDR deforestation provider

- **Status:** Accepted
- **Date:** 2026-05-16
- **Decision drivers:** EUDR Article 9(1)(h); audit reproducibility; cost; the absence of an official JRC EUDR risk map at the time this ADR was written.

## Context

EUDR Article 9(1)(h) requires operators to attach "adequately conclusive and verifiable" information that each plot is deforestation-free relative to the 31 December 2020 cut-off. The platform's plot registration flow runs that check via a `DeforestationProvider` interface, recorded per-plot in `deforestation_checks` and surfaced in the eventual Due Diligence Statement.

Until this change the only implementation was `MockDeforestationProvider`, which always returns "no deforestation". That was deliberate during scaffolding but obviously cannot ship to production.

The realistic candidates for a first real provider are:

1. **UMD/Hansen Global Forest Change via the GFW Data API.** Annual tree cover loss raster covering 2001-onwards, free to query with an API key, well-documented, broadly accepted by EU competent authorities as a reasonable evidence baseline.
2. **JRC EUDR Observatory maps.** The Commission's own forest cover product, in development but not yet published as a stable API at the time of writing.
3. **Sentinel Hub / Planet Labs.** Higher-resolution but paid, with per-image quotas; better suited to a Tier-2 check that confirms a GFW disqualification.

We need _some_ real provider now, with a path to layer additional sources later.

## Decision

Make Global Forest Watch the default real provider, plugged in behind the existing `DeforestationProvider` interface and selected via the `DEFORESTATION_PROVIDER` environment variable.

- Implementation lives in `apps/web/lib/deforestation.ts` as `GfwDeforestationProvider`.
- Provider selection in `getDeforestationProvider()` accepts `mock` (default) and `gfw`. Unknown values fall back to `mock` with a `console.warn`; `gfw` without a `GFW_API_KEY` throws `DeforestationProviderUnavailableError` at construction time so the misconfiguration surfaces immediately instead of silently downgrading.
- The dataset queried is `umd_tree_cover_loss` at the canopy-density threshold of 30% (matching JRC's EUDR Observatory methodology). Any loss recorded for year >= 2021 in the plot polygon triggers a `deforestationDetected: true` verdict.
- The dataset version is `latest` by default and pinnable via `GFW_DATASET_VERSION` for reproducible audits — production deployments SHOULD pin it.
- Other defaults are documented in `.env.example` (timeout, base URL override).

### Fail-closed unavailability handling

When the provider cannot produce a verdict (timeout, non-2xx, malformed body), the adapter throws `DeforestationProviderUnavailableError`. The error bubbles out of `registerPlot` and the form layer surfaces it as "deforestation provider unavailable, please retry". Registration is **refused**, not silently attested.

This is the most consequential decision in this ADR. The alternative — persisting the plot with `deforestationDetected: false` and a "pending re-check" flag — would let an operator generate evidence that the platform actually never verified. For an EUDR-compliance product that is regulatory poison. Better to block registration until the provider comes back than to ship false attestations.

A follow-up workstream will add a `deforestation_check_status` column and a reconciler that re-runs failed checks asynchronously when GFW is unavailable for an extended period, so operators can register plots and have the check land later. That migration is not in scope here.

## Consequences

**Positive**

- Real EUDR Article 9(1)(h) coverage immediately, with a single env-var flip.
- Audit-grade `deforestation_checks.raw` payloads (per-year loss breakdown, dataset version, canopy threshold) for downstream verification.
- The interface stays stable — adding JRC or Planet later is a new class implementing `DeforestationProvider`.

**Negative**

- GFW Data API rate limits (free tier ~10 RPS sustained) will throttle very large bulk imports. The current bulk-import path processes rows sequentially, which is gentle on the limit but slow for large cooperatives. A bounded concurrency pool plus per-geohash caching is a future workstream.
- Annual-resolution loss data means a polygon affected by deforestation in early 2026 isn't observable until the 2026 dataset publishes (typically Q1 of the following year). This is a limitation of the underlying dataset, not the adapter.
- Fail-closed means an outage at GFW blocks plot registration. For a compliance product this is the right trade-off; we will monitor it via Sentry / GFW status pages and consider a multi-provider failover if it becomes a real operational problem.

## Alternatives considered

- **JRC EUDR Observatory.** The natural long-term default, but not a stable API as of 2026-05. We will add a `jrc` provider when that lands and re-evaluate the default in a future ADR.
- **Sentinel Hub / Planet.** Higher resolution but paid and rate-limited per-image; better as a Tier-2 confirmation provider for plots GFW flags, layered on top via a composite provider. Out of scope here.
- **Fail-open on provider unreachability.** Rejected — silent false attestations are unacceptable for the regulatory use case. See "Fail-closed unavailability handling" above.

## References

- Regulation (EU) 2023/1115 (EUDR), Article 9(1)(h).
- Hansen, M. C. et al. (2013) "High-Resolution Global Maps of 21st-Century Forest Cover Change," Science 342:850-853.
- Global Forest Watch Data API: <https://data-api.globalforestwatch.org/>.
- JRC EUDR Observatory: <https://forest-observatory.ec.europa.eu/>.
- ADR-0004 (PostGIS for plot geometry) — establishes the geometry model the adapter queries against.
