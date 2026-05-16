import { createHash, randomUUID } from 'node:crypto';

import { eq, sql, desc } from 'drizzle-orm';

import { schema } from '@shamba/db';
import {
  type Commodity,
  type Polygon,
  type Point,
  type PlotGeometry,
  plotGeometrySchema,
  commoditySchema,
  countryCodeSchema,
  EUDR_POLYGON_THRESHOLD_HECTARES,
} from '@shamba/shared-types';

import { db } from './db';
import { getDeforestationProvider } from './deforestation';
import { publishEvent } from './hedera-publisher';

const { plots, deforestationChecks, events, actors } = schema;

/**
 * Earth's mean radius used for the planar polygon-area estimator below. Good
 * to ~0.5% for plots up to a few hundred hectares. For audit-grade area we
 * lean on Postgres: `ST_Area(geometry::geography) / 10000.0` which lives in
 * the same row. The planar estimator is solely used for pre-database
 * validation so the application can reject malformed polygons before they
 * reach PostGIS.
 */
const EARTH_RADIUS_METERS = 6_378_137;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Spherical-excess area estimator for a closed ring expressed as
 * [lon, lat] WGS 84 positions. Returns area in square metres. Adequate for
 * EUDR's ~4 ha threshold check; production area attribution comes from
 * PostGIS' `ST_Area(geography)` once the row is persisted.
 */
function ringAreaSquareMeters(ring: ReadonlyArray<readonly [number, number]>): number {
  let total = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [lon1, lat1] = ring[i]!;
    const [lon2, lat2] = ring[i + 1]!;
    total += toRadians(lon2 - lon1) * (2 + Math.sin(toRadians(lat1)) + Math.sin(toRadians(lat2)));
  }
  return Math.abs((total * EARTH_RADIUS_METERS * EARTH_RADIUS_METERS) / 2);
}

function geometryAreaHectares(geometry: PlotGeometry): number {
  if (geometry.type === 'Point') return 0;
  const [exterior, ...holes] = geometry.coordinates;
  if (!exterior) return 0;
  const gross = ringAreaSquareMeters(exterior);
  const holeArea = holes.reduce((acc, ring) => acc + ringAreaSquareMeters(ring), 0);
  return Math.max(0, (gross - holeArea) / 10_000);
}

/**
 * Convert a GeoJSON-shaped plot geometry to PostGIS Well-Known Text. The DB
 * column is `geography(GEOMETRY, 4326)`, so the SRID must come along with the
 * value via `ST_GeomFromText(wkt, 4326)::geography` in the SQL fragment.
 */
function geometryToWkt(geometry: PlotGeometry): string {
  if (geometry.type === 'Point') {
    const [lon, lat] = geometry.coordinates;
    return `POINT(${lon} ${lat})`;
  }
  const rings = geometry.coordinates
    .map((ring) => ring.map(([lon, lat]) => `${lon} ${lat}`).join(', '))
    .map((r) => `(${r})`)
    .join(', ');
  return `POLYGON(${rings})`;
}

export class PlotValidationError extends Error {
  readonly issues: ReadonlyArray<{ path: string; message: string }>;

  constructor(issues: ReadonlyArray<{ path: string; message: string }>) {
    super('plot input failed validation');
    this.issues = issues;
    this.name = 'PlotValidationError';
  }
}

export interface RegisterPlotInput {
  ownerActorId: string;
  country: string;
  subnational?: string;
  commodities: ReadonlyArray<Commodity>;
  geometry: Polygon | Point;
}

export interface RegisteredPlot {
  id: string;
  ownerActorId: string;
  country: string;
  commodities: Commodity[];
  areaHectares: number;
  deforestationDetected: boolean;
  eventId: string;
  eventHash: string;
  /**
   * Hedera Consensus Service topic the `plot_attested` event was committed
   * to. `null` when the publisher was unreachable, timed out, returned a
   * non-2xx, or returned a malformed body. (Mock mode still returns a
   * topic id — `null` is failure, not mock-skip.) A background reconciler
   * to retry pending commits is **future work**; today these rows stay
   * `null` until someone manually re-runs the publish or the reconciler
   * ships.
   */
  onChainTopicId: string | null;
}

/**
 * EUDR plot registration entry point. Validates the input, runs the
 * configured deforestation provider, persists three rows in a single
 * transaction, and then commits the event to HCS via the publisher
 * service.
 *
 *   1. `plots` — the plot itself with PostGIS geography (SRID 4326).
 *   2. `deforestation_checks` — the provider's result, including its raw
 *      response for audit-trail reproducibility.
 *   3. `events` — a `plot_attested` event row carrying the canonical
 *      payload hash that gets committed on-chain immediately afterwards.
 *
 * The HCS publish runs **after** the DB transaction commits so a slow or
 * unreachable publisher does not hold a database connection. On
 * publisher failure (network error, non-2xx, malformed response) the
 * `events` and `plots` rows persist with `on_chain_*` columns null. A
 * background reconciler that retries pending publishes is **future
 * work**; until it ships, pending rows stay pending until manual
 * intervention.
 *
 * Returns the new plot's id along with the event id, its hash, and the
 * resulting on-chain topic id (or null if the publish was deferred).
 */
export async function registerPlot(input: RegisterPlotInput): Promise<RegisteredPlot> {
  const issues: { path: string; message: string }[] = [];

  const geometryResult = plotGeometrySchema.safeParse(input.geometry);
  if (!geometryResult.success) {
    geometryResult.error.issues.forEach((issue) => {
      issues.push({ path: `geometry.${issue.path.join('.')}`, message: issue.message });
    });
  }

  const countryResult = countryCodeSchema.safeParse(input.country.toUpperCase());
  if (!countryResult.success) {
    issues.push({ path: 'country', message: 'enter an ISO 3166-1 alpha-2 country code' });
  }

  if (input.commodities.length === 0) {
    issues.push({ path: 'commodities', message: 'select at least one commodity' });
  } else {
    input.commodities.forEach((commodity, idx) => {
      const r = commoditySchema.safeParse(commodity);
      if (!r.success) {
        issues.push({ path: `commodities.${idx}`, message: 'unsupported commodity' });
      }
    });
  }

  let areaHectares = 0;
  if (geometryResult.success) {
    areaHectares = geometryAreaHectares(geometryResult.data);
    if (geometryResult.data.type === 'Point' && areaHectares === 0) {
      // Point geometries are only valid for sub-threshold plots; we treat them
      // as 0 ha and skip the polygon-area check.
    } else if (
      areaHectares > EUDR_POLYGON_THRESHOLD_HECTARES &&
      geometryResult.data.type !== 'Polygon'
    ) {
      issues.push({
        path: 'geometry',
        message: 'plots larger than 4 hectares must use a Polygon geometry (EUDR Article 9(1)(d))',
      });
    }
    if (areaHectares <= 0 && geometryResult.data.type === 'Polygon') {
      issues.push({ path: 'geometry', message: 'polygon area must be positive' });
    }
  }

  if (issues.length > 0) {
    throw new PlotValidationError(issues);
  }

  const wkt = geometryToWkt(geometryResult.data!);
  const country = countryResult.data!;
  const commodities = [...input.commodities];
  const now = new Date();

  // Run the deforestation provider before opening the transaction. The check
  // can be expensive and we don't want to hold a database transaction open
  // while we wait on an external API.
  const provider = getDeforestationProvider();
  const checkResult = await provider.checkPlot({
    geometry: geometryResult.data!,
    country,
    cutOffDate: undefined,
  });

  const eventId = randomUUID();

  return db
    .transaction(async (tx) => {
      const [plotRow] = await tx
        .insert(plots)
        .values({
          ownerActorId: input.ownerActorId,
          country,
          subnational: input.subnational?.trim() || null,
          commodities,
          geometry: sql`ST_GeomFromText(${wkt}, 4326)::geography`,
          areaHectares,
          registeredAt: now,
        })
        .returning({ id: plots.id });

      if (!plotRow) {
        throw new Error('plot insert returned no rows');
      }

      await tx.insert(deforestationChecks).values({
        plotId: plotRow.id,
        provider: checkResult.provider,
        providerVersion: checkResult.providerVersion ?? null,
        cutOffDate: new Date(checkResult.cutOffDate),
        performedAt: new Date(checkResult.performedAt),
        deforestationDetected: checkResult.deforestationDetected,
        hectaresLostAfterCutOff: checkResult.hectaresLostAfterCutOff ?? null,
        evidenceCid: checkResult.evidenceCid ?? null,
        notes: checkResult.notes ?? null,
        raw: checkResult.raw ?? {},
      });

      const eventPayload = {
        v: 1 as const,
        type: 'plot_attested' as const,
        plotId: plotRow.id,
        ownerActorId: input.ownerActorId,
        country,
        commodities,
        areaHectares,
        deforestationCheck: {
          provider: checkResult.provider,
          deforestationDetected: checkResult.deforestationDetected,
          cutOffDate: checkResult.cutOffDate,
          performedAt: checkResult.performedAt,
        },
        emittedAt: now.toISOString(),
      };
      const canonical = JSON.stringify(eventPayload);
      const payloadHash = createHash('sha256').update(canonical, 'utf8').digest('hex');

      // Every event must attribute to a verifiable actor identity (ADR-0003);
      // look up the owner's DID so it can be persisted on the event row.
      const [actorRow] = await tx
        .select({ did: actors.did })
        .from(actors)
        .where(eq(actors.id, input.ownerActorId))
        .limit(1);
      if (!actorRow) {
        throw new Error(`actor ${input.ownerActorId} not found while emitting plot_attested event`);
      }

      await tx.insert(events).values({
        id: eventId,
        plotId: plotRow.id,
        type: 'plot_attested',
        emittedAt: now,
        emittedByDid: actorRow.did,
        payload: eventPayload,
        payloadHash,
        // on_chain_* columns are backfilled by the post-commit publish below.
      });

      // Build the on-chain commitment. Per shared-types/event.ts the HCS
      // message body is an EventCommitment — a compact struct carrying the
      // SHA-256 hash of the canonical off-chain payload — NOT the payload
      // itself. Auditors hash events.payload and compare to the on-chain
      // payloadHash; events.payload stays off-chain.
      const eventCommitment = {
        v: 1 as const,
        type: 'plot_attested' as const,
        plotId: plotRow.id,
        emittedAt: now.toISOString(),
        emittedByDid: actorRow.did,
        payloadHash,
      };

      return {
        plotRowId: plotRow.id,
        eventCommitment,
        payloadHash,
      };
    })
    .then(async ({ plotRowId, eventCommitment, payloadHash }) => {
      // Post-commit on-chain publish. Done OUTSIDE the transaction so a
      // slow or unreachable publisher does not hold a database connection.
      // On failure publishEvent returns null and we leave the on_chain_*
      // columns null. There is no automatic reconciler today — pending
      // rows stay pending until manual intervention or a future PR ships
      // the reconciler. The plot itself is already persisted regardless.
      const publish = await publishEvent('', eventCommitment);
      if (publish) {
        try {
          await db.transaction(async (tx) => {
            await tx
              .update(events)
              .set({
                onChainTopicId: publish.topicId,
                onChainSequenceNumber: publish.sequenceNumber,
                onChainConsensusTimestamp: new Date(publish.consensusTimestamp),
                onChainTransactionId: publish.transactionId,
              })
              .where(eq(events.id, eventId));
            await tx
              .update(plots)
              .set({ onChainCommitmentTopicId: publish.topicId })
              .where(eq(plots.id, plotRowId));
          });
        } catch (error) {
          // HCS commit succeeded but the local backfill failed. The plot
          // and event are already persisted; the user-facing response
          // still gets the topic id so the dashboard shows "Committed".
          // The DB row will read as pending until the reconciler closes
          // the gap. Loud log so this surfaces in production traces.
          console.error('[plot] HCS commit succeeded but on_chain_* backfill failed', {
            plotId: plotRowId,
            eventId,
            topicId: publish.topicId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return {
        id: plotRowId,
        ownerActorId: input.ownerActorId,
        country,
        commodities,
        areaHectares,
        deforestationDetected: checkResult.deforestationDetected,
        eventId,
        eventHash: payloadHash,
        onChainTopicId: publish?.topicId ?? null,
      } satisfies RegisteredPlot;
    });
}

/**
 * List plots owned by a given actor, newest registration first. Used by the
 * `/dashboard/plots` page. `onChainTopicId` is non-null once the publisher
 * has committed the plot's `plot_attested` event to HCS.
 */
export async function listPlotsForActor(ownerActorId: string): Promise<
  Array<{
    id: string;
    country: string;
    subnational: string | null;
    commodities: string[];
    areaHectares: number;
    registeredAt: Date;
    onChainTopicId: string | null;
  }>
> {
  return db
    .select({
      id: plots.id,
      country: plots.country,
      subnational: plots.subnational,
      commodities: plots.commodities,
      areaHectares: plots.areaHectares,
      registeredAt: plots.registeredAt,
      onChainTopicId: plots.onChainCommitmentTopicId,
    })
    .from(plots)
    .where(eq(plots.ownerActorId, ownerActorId))
    .orderBy(desc(plots.registeredAt))
    .limit(100);
}
