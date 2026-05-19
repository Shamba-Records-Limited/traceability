import { createHash, randomUUID } from 'node:crypto';

import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { db } from './db';
import { publishEvent } from './hedera-publisher';
import { canonicaliseJson } from './json-canonical';

const { actors, batches, batchPlots, deforestationChecks, events, plots } = schema;

/**
 * EUDR cut-off instant; Article 3 deforestation-free benchmark.
 */
const EUDR_CUT_OFF = '2020-12-31T23:59:59.999Z';

export class DdsGenerationError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'DdsGenerationError';
  }
}

interface PlotForDds {
  id: string;
  country: string;
  subnational: string | null;
  commodities: string[];
  areaHectares: number;
  /** GeoJSON, fetched via ST_AsGeoJSON. */
  geometry: unknown;
  registeredAt: string;
  deforestation: {
    provider: string;
    providerVersion: string | null;
    cutOffDate: string;
    performedAt: string;
    deforestationDetected: boolean;
    hectaresLostAfterCutOff: number | null;
  } | null;
}

/**
 * Canonical EUDR Due Diligence Statement bundle. The structure follows
 * the Commission's published schema (Implementing Regulation 2024/3084
 * Annex; current as of 2026-05) — Article 9 information requirements
 * plus the operator details and a deforestation-free statement.
 *
 * The shape is deliberately verbose: every Article 9(1) sub-paragraph
 * lands in its own labelled field so the bundle is self-documenting
 * for an auditor reading it without the regulation in hand.
 */
export interface DdsBundle {
  /** Bundle schema version; bumped when the JSON shape changes. */
  v: 1;
  ddsReferenceNumber: string;
  generatedAt: string;
  cutOffDate: string;
  operator: {
    actorId: string;
    did: string;
    role: string;
    legalName: string;
    country: string;
    subnational: string | null;
    contactEmail: string | null;
  };
  batch: {
    id: string;
    commodity: string;
    processingStage: string;
    quantity: number;
    unit: string;
    productionStart: string;
    productionEnd: string;
    onChainTopicId: string | null;
    onChainTokenId: string | null;
    onChainSerialNumber: string | null;
    onChainRegistryTxId: string | null;
  };
  /** Article 9(1)(c): country (and parts of country) of production. */
  countriesOfProduction: Array<{ country: string; subnational: string | null }>;
  /** Article 9(1)(d): geolocation of all plots. */
  plotsOfLand: PlotForDds[];
  /** Article 9(1)(h): deforestation-free conclusive evidence. */
  deforestationFreeStatement: {
    statement: 'no_deforestation_detected_after_cut_off' | 'deforestation_detected';
    cutOffDate: string;
    providers: Array<{
      name: string;
      version: string | null;
      performedAt: string;
      plotsCovered: number;
    }>;
    totalHectaresLostAfterCutOff: number;
  };
  /** Article 9(1)(f),(g): supplier + downstream chain. */
  chainOfCustody: Array<{
    handoffId: string | null;
    fromActorId: string;
    fromDid: string;
    toActorId: string | null;
    toDid: string | null;
    atIsoTimestamp: string;
    quantity: number;
    unit: string;
  }>;
  /** Article 9(1)(i): legality module placeholder; Phase 2. */
  legalityAttestation: {
    status: 'planned_phase_2';
    note: string;
  };
  /** SHA-256 of the canonical JSON encoding of all fields above. */
  contentHash: string;
}

interface GenerateInput {
  batchId: string;
  operatorActorId: string;
}

/**
 * Build the canonical DDS bundle for a batch + operator. Asserts the
 * operator is the current custodian of the batch. Pulls plot
 * geometry (via ST_AsGeoJSON), the latest deforestation check per
 * plot, and the chain-of-custody handoff history. Emits a
 * `dds_issued` event with the bundle's contentHash committed to HCS.
 *
 * Returns the bundle + the event id; the canonical hash is also in
 * `bundle.contentHash`.
 */
export async function generateDdsBundle(input: GenerateInput): Promise<{
  bundle: DdsBundle;
  eventId: string;
  onChainTopicId: string | null;
}> {
  const [batch] = await db
    .select({
      id: batches.id,
      commodity: batches.commodity,
      processingStage: batches.processingStage,
      quantity: batches.quantity,
      unit: batches.unit,
      productionStart: batches.productionStart,
      productionEnd: batches.productionEnd,
      custodianActorId: batches.custodianActorId,
      status: batches.status,
      onChainTopicId: batches.onChainTopicId,
      onChainTokenId: batches.onChainTokenId,
      onChainSerialNumber: batches.onChainSerialNumber,
      onChainRegistryTxId: batches.onChainRegistryTxId,
    })
    .from(batches)
    .where(eq(batches.id, input.batchId))
    .limit(1);
  if (!batch) throw new DdsGenerationError(404, 'batch not found');
  if (batch.custodianActorId !== input.operatorActorId) {
    throw new DdsGenerationError(
      403,
      'only the current custodian can generate a DDS bundle for this batch',
    );
  }
  if (batch.status === 'voided') {
    throw new DdsGenerationError(409, 'cannot generate a DDS for a voided batch');
  }

  const [operator] = await db
    .select({
      id: actors.id,
      did: actors.did,
      role: actors.role,
      displayName: actors.displayName,
      country: actors.country,
      subnational: actors.subnational,
      contactEmail: actors.contactEmail,
    })
    .from(actors)
    .where(eq(actors.id, input.operatorActorId))
    .limit(1);
  if (!operator) throw new DdsGenerationError(500, 'operator actor row not found');

  // Source plots + their geometry as GeoJSON (PostGIS).
  const plotsRaw = await db
    .select({
      id: plots.id,
      country: plots.country,
      subnational: plots.subnational,
      commodities: plots.commodities,
      areaHectares: plots.areaHectares,
      registeredAt: plots.registeredAt,
      geometryJson: sql<string>`ST_AsGeoJSON(${plots.geometry})`,
    })
    .from(plots)
    .innerJoin(batchPlots, eq(batchPlots.plotId, plots.id))
    .where(eq(batchPlots.batchId, batch.id));

  if (plotsRaw.length === 0) {
    throw new DdsGenerationError(
      409,
      'batch has no source plots; refusing to issue a DDS without geolocation',
    );
  }

  // Latest deforestation check per plot (tie-broken by id DESC, matching
  // batch creation's eligibility pass).
  const plotIds = plotsRaw.map((p) => p.id);
  const checksRaw = await db
    .select({
      id: deforestationChecks.id,
      plotId: deforestationChecks.plotId,
      provider: deforestationChecks.provider,
      providerVersion: deforestationChecks.providerVersion,
      cutOffDate: deforestationChecks.cutOffDate,
      performedAt: deforestationChecks.performedAt,
      deforestationDetected: deforestationChecks.deforestationDetected,
      hectaresLostAfterCutOff: deforestationChecks.hectaresLostAfterCutOff,
    })
    .from(deforestationChecks)
    .where(inArray(deforestationChecks.plotId, plotIds))
    .orderBy(desc(deforestationChecks.performedAt), desc(deforestationChecks.id));
  const latestCheckByPlot = new Map<string, (typeof checksRaw)[number]>();
  for (const c of checksRaw) {
    if (!latestCheckByPlot.has(c.plotId)) latestCheckByPlot.set(c.plotId, c);
  }

  // Chain of custody: every handoff_received event for this batch, in
  // chronological order, plus the original batch_created emitter as the
  // "from" entry at the head.
  const chainEvents = await db
    .select({
      id: events.id,
      type: events.type,
      emittedAt: events.emittedAt,
      emittedByDid: events.emittedByDid,
      payload: events.payload,
    })
    .from(events)
    .where(
      and(
        eq(events.batchId, batch.id),
        inArray(events.type, ['batch_created', 'handoff_received'] as const),
      ),
    )
    .orderBy(events.emittedAt);

  const chainOfCustody: DdsBundle['chainOfCustody'] = chainEvents.map((evt) => {
    const p = evt.payload as Record<string, unknown>;
    if (evt.type === 'batch_created') {
      return {
        handoffId: null,
        fromActorId: String(p.custodianActorId ?? ''),
        fromDid: String(p.custodianDid ?? evt.emittedByDid),
        toActorId: null,
        toDid: null,
        atIsoTimestamp: evt.emittedAt.toISOString(),
        quantity: Number(p.quantity ?? 0),
        unit: String(p.unit ?? ''),
      };
    }
    return {
      handoffId: String(p.handoffId ?? ''),
      fromActorId: String(p.fromActorId ?? ''),
      fromDid: String(p.fromDid ?? ''),
      toActorId: String(p.toActorId ?? ''),
      toDid: String(p.toDid ?? evt.emittedByDid),
      atIsoTimestamp: evt.emittedAt.toISOString(),
      quantity: Number(p.quantity ?? 0),
      unit: String(p.unit ?? ''),
    };
  });

  // Compose the verdict section.
  const plotChecks = plotsRaw.map((p) => latestCheckByPlot.get(p.id) ?? null);
  const anyDetected = plotChecks.some((c) => c?.deforestationDetected ?? false);
  const totalLost = plotChecks.reduce((acc, c) => acc + (c?.hectaresLostAfterCutOff ?? 0), 0);
  const providersAggregated = new Map<
    string,
    { version: string | null; performedAt: string; count: number }
  >();
  for (const c of plotChecks) {
    if (!c) continue;
    const key = `${c.provider}@${c.providerVersion ?? ''}`;
    const existing = providersAggregated.get(key);
    if (existing) {
      existing.count += 1;
      if (c.performedAt.toISOString() > existing.performedAt) {
        existing.performedAt = c.performedAt.toISOString();
      }
    } else {
      providersAggregated.set(key, {
        version: c.providerVersion,
        performedAt: c.performedAt.toISOString(),
        count: 1,
      });
    }
  }

  const plotsOfLand: PlotForDds[] = plotsRaw.map((p) => {
    const check = latestCheckByPlot.get(p.id);
    return {
      id: p.id,
      country: p.country,
      subnational: p.subnational,
      commodities: p.commodities as string[],
      areaHectares: p.areaHectares,
      geometry: JSON.parse(p.geometryJson),
      registeredAt: p.registeredAt.toISOString(),
      deforestation: check
        ? {
            provider: check.provider,
            providerVersion: check.providerVersion,
            cutOffDate: check.cutOffDate.toISOString(),
            performedAt: check.performedAt.toISOString(),
            deforestationDetected: check.deforestationDetected,
            hectaresLostAfterCutOff: check.hectaresLostAfterCutOff,
          }
        : null,
    };
  });

  const countriesOfProductionMap = new Map<string, string | null>();
  for (const p of plotsRaw) {
    const key = `${p.country}::${p.subnational ?? ''}`;
    if (!countriesOfProductionMap.has(key)) {
      countriesOfProductionMap.set(key, p.subnational);
    }
  }
  const countriesOfProduction = Array.from(countriesOfProductionMap.entries()).map(([key, sub]) => {
    const [country] = key.split('::');
    return { country: country!, subnational: sub };
  });

  const ddsReferenceNumber = `SHAMBA-DDS-${batch.id.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  const generatedAt = new Date().toISOString();

  // Build the bundle WITHOUT the contentHash first so we can canonicalise
  // a deterministic JSON encoding and hash it.
  const bundleBase: Omit<DdsBundle, 'contentHash'> = {
    v: 1,
    ddsReferenceNumber,
    generatedAt,
    cutOffDate: EUDR_CUT_OFF,
    operator: {
      actorId: operator.id,
      did: operator.did,
      role: operator.role,
      legalName: operator.displayName,
      country: operator.country,
      subnational: operator.subnational,
      contactEmail: operator.contactEmail,
    },
    batch: {
      id: batch.id,
      commodity: batch.commodity,
      processingStage: batch.processingStage,
      quantity: batch.quantity,
      unit: batch.unit,
      productionStart: batch.productionStart.toISOString(),
      productionEnd: batch.productionEnd.toISOString(),
      onChainTopicId: batch.onChainTopicId,
      onChainTokenId: batch.onChainTokenId,
      onChainSerialNumber:
        batch.onChainSerialNumber === null ? null : batch.onChainSerialNumber.toString(),
      onChainRegistryTxId: batch.onChainRegistryTxId,
    },
    countriesOfProduction,
    plotsOfLand,
    deforestationFreeStatement: {
      statement: anyDetected ? 'deforestation_detected' : 'no_deforestation_detected_after_cut_off',
      cutOffDate: EUDR_CUT_OFF,
      providers: Array.from(providersAggregated.entries()).map(([k, v]) => ({
        name: k.split('@')[0]!,
        version: v.version,
        performedAt: v.performedAt,
        plotsCovered: v.count,
      })),
      totalHectaresLostAfterCutOff: Math.round(totalLost * 1_000_000) / 1_000_000,
    },
    chainOfCustody,
    legalityAttestation: {
      status: 'planned_phase_2',
      note: 'Article 9(1)(i) legality module ships in Phase 2; this DDS does not yet include conclusive legality evidence.',
    },
  };

  const canonical = canonicaliseJson(bundleBase);
  const contentHash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  const bundle: DdsBundle = { ...bundleBase, contentHash };

  // Emit a `dds_issued` event so the bundle's hash is committed on-chain.
  const eventId = randomUUID();
  const eventPayload = {
    v: 1 as const,
    type: 'dds_issued' as const,
    batchId: batch.id,
    operatorActorId: operator.id,
    operatorDid: operator.did,
    ddsReferenceNumber,
    contentHash,
    generatedAt,
  };
  const payloadCanonical = JSON.stringify(eventPayload);
  const payloadHash = createHash('sha256').update(payloadCanonical, 'utf8').digest('hex');

  await db.insert(events).values({
    id: eventId,
    batchId: batch.id,
    type: 'dds_issued',
    emittedAt: new Date(generatedAt),
    emittedByDid: operator.did,
    payload: eventPayload,
    payloadHash,
  });

  const publish = await publishEvent('', {
    v: 1 as const,
    type: 'dds_issued' as const,
    batchId: batch.id,
    emittedAt: generatedAt,
    emittedByDid: operator.did,
    payloadHash,
  });
  if (publish) {
    try {
      await db
        .update(events)
        .set({
          onChainTopicId: publish.topicId,
          onChainSequenceNumber: publish.sequenceNumber,
          onChainConsensusTimestamp: new Date(publish.consensusTimestamp),
          onChainTransactionId: publish.transactionId,
        })
        .where(eq(events.id, eventId));
    } catch (error) {
      console.error('[dds] HCS publish backfill failed', {
        eventId,
        ddsReferenceNumber,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    bundle,
    eventId,
    onChainTopicId: publish?.topicId ?? null,
  };
}
