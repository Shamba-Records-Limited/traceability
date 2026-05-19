import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { db } from './db';
import { generateShareToken, hashShareToken, looksLikeShareToken } from './audit-share-crypto';

const { actors, auditShares, batches, batchPlots, deforestationChecks, events, plots } = schema;

export class AuditShareError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'AuditShareError';
  }
}

const MIN_EXPIRY_MS = 60 * 60 * 1_000; // 1 hour
const MAX_EXPIRY_MS = 5 * 365 * 24 * 60 * 60 * 1_000; // 5 years
const DEFAULT_EXPIRY_MS = 90 * 24 * 60 * 60 * 1_000; // 90 days

/**
 * Mint a new share link for `batchId`. Returns the cleartext token
 * once — store it nowhere except inside the URL handed to the
 * recipient. The DB row records only the SHA-256 hash + first 12
 * chars for the dashboard list.
 */
export async function createAuditShare(input: {
  batchId: string;
  operatorActorId: string;
  label: string;
  expiresInMs?: number;
}): Promise<{
  shareId: string;
  cleartext: string;
  expiresAt: Date;
}> {
  const label = input.label.trim();
  if (!label) throw new AuditShareError(400, 'label is required');
  if (label.length > 200) throw new AuditShareError(400, 'label is too long (max 200)');

  // Ownership check.
  const [batch] = await db
    .select({ id: batches.id, custodianActorId: batches.custodianActorId })
    .from(batches)
    .where(eq(batches.id, input.batchId))
    .limit(1);
  if (!batch) throw new AuditShareError(404, 'batch not found');
  if (batch.custodianActorId !== input.operatorActorId) {
    throw new AuditShareError(
      403,
      'only the current custodian can mint share links for this batch',
    );
  }

  let ttl = input.expiresInMs ?? DEFAULT_EXPIRY_MS;
  if (!Number.isFinite(ttl) || ttl < MIN_EXPIRY_MS || ttl > MAX_EXPIRY_MS) {
    ttl = DEFAULT_EXPIRY_MS;
  }
  const expiresAt = new Date(Date.now() + ttl);

  const { cleartext, prefix, tokenHash } = generateShareToken();
  const [row] = await db
    .insert(auditShares)
    .values({
      batchId: input.batchId,
      operatorActorId: input.operatorActorId,
      label,
      tokenHash,
      tokenPrefix: prefix,
      expiresAt,
    })
    .returning({ id: auditShares.id });
  if (!row) throw new Error('audit_share insert returned no rows');
  return { shareId: row.id, cleartext, expiresAt };
}

export async function listSharesForBatch(batchId: string, operatorActorId: string) {
  return db
    .select({
      id: auditShares.id,
      label: auditShares.label,
      tokenPrefix: auditShares.tokenPrefix,
      expiresAt: auditShares.expiresAt,
      revokedAt: auditShares.revokedAt,
      lastAccessedAt: auditShares.lastAccessedAt,
      accessCount: auditShares.accessCount,
      createdAt: auditShares.createdAt,
    })
    .from(auditShares)
    .where(and(eq(auditShares.batchId, batchId), eq(auditShares.operatorActorId, operatorActorId)))
    .orderBy(desc(auditShares.createdAt))
    .limit(50);
}

export async function revokeAuditShare(input: {
  shareId: string;
  operatorActorId: string;
}): Promise<boolean> {
  const updated = await db
    .update(auditShares)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(auditShares.id, input.shareId),
        eq(auditShares.operatorActorId, input.operatorActorId),
        isNull(auditShares.revokedAt),
      ),
    )
    .returning({ id: auditShares.id });
  return updated.length === 1;
}

export interface AuditBundle {
  share: {
    id: string;
    label: string;
    expiresAt: string;
    accessCount: number;
  };
  operator: {
    legalName: string;
    role: string;
    country: string;
    subnational: string | null;
    did: string;
  };
  batch: {
    id: string;
    commodity: string;
    processingStage: string;
    quantity: number;
    unit: string;
    productionStart: string;
    productionEnd: string;
    status: string;
    onChainTopicId: string | null;
    onChainTokenId: string | null;
    onChainSerialNumber: string | null;
    onChainRegistryTxId: string | null;
  };
  plots: Array<{
    id: string;
    country: string;
    subnational: string | null;
    commodities: string[];
    areaHectares: number;
    geometry: unknown;
    deforestation: {
      provider: string;
      cutOffDate: string;
      performedAt: string;
      deforestationDetected: boolean;
      hectaresLostAfterCutOff: number | null;
    } | null;
  }>;
  events: Array<{
    id: string;
    type: string;
    emittedAt: string;
    emittedByDid: string;
    payloadHash: string;
    onChainTopicId: string | null;
    onChainSequenceNumber: string | null;
    onChainConsensusTimestamp: string | null;
    onChainTransactionId: string | null;
  }>;
}

/**
 * Resolve a cleartext share token to its audit bundle, OR return null
 * if the token is missing/malformed/unknown/expired/revoked. Bumps the
 * access counter + last-accessed timestamp fire-and-forget on success
 * so the operator can see read activity on the dashboard.
 */
export async function resolveAuditShare(cleartextToken: string): Promise<AuditBundle | null> {
  if (!looksLikeShareToken(cleartextToken)) return null;
  const tokenHash = hashShareToken(cleartextToken);
  const [share] = await db
    .select({
      id: auditShares.id,
      batchId: auditShares.batchId,
      operatorActorId: auditShares.operatorActorId,
      label: auditShares.label,
      expiresAt: auditShares.expiresAt,
      revokedAt: auditShares.revokedAt,
      accessCount: auditShares.accessCount,
    })
    .from(auditShares)
    .where(eq(auditShares.tokenHash, tokenHash))
    .limit(1);
  if (!share) return null;
  if (share.revokedAt) return null;
  if (share.expiresAt.getTime() < Date.now()) return null;

  const [batchRow] = await db
    .select({
      id: batches.id,
      commodity: batches.commodity,
      processingStage: batches.processingStage,
      quantity: batches.quantity,
      unit: batches.unit,
      productionStart: batches.productionStart,
      productionEnd: batches.productionEnd,
      status: batches.status,
      onChainTopicId: batches.onChainTopicId,
      onChainTokenId: batches.onChainTokenId,
      onChainSerialNumber: batches.onChainSerialNumber,
      onChainRegistryTxId: batches.onChainRegistryTxId,
    })
    .from(batches)
    .where(eq(batches.id, share.batchId))
    .limit(1);
  if (!batchRow) return null;

  const [operatorRow] = await db
    .select({
      displayName: actors.displayName,
      role: actors.role,
      country: actors.country,
      subnational: actors.subnational,
      did: actors.did,
    })
    .from(actors)
    .where(eq(actors.id, share.operatorActorId))
    .limit(1);
  if (!operatorRow) return null;

  // Plots + latest deforestation check.
  const plotsRaw = await db
    .select({
      id: plots.id,
      country: plots.country,
      subnational: plots.subnational,
      commodities: plots.commodities,
      areaHectares: plots.areaHectares,
      geometryJson: sql<string>`ST_AsGeoJSON(${plots.geometry})`,
    })
    .from(plots)
    .innerJoin(batchPlots, eq(batchPlots.plotId, plots.id))
    .where(eq(batchPlots.batchId, share.batchId));

  const plotIds = plotsRaw.map((p) => p.id);
  const checksRaw =
    plotIds.length === 0
      ? []
      : await db
          .select({
            id: deforestationChecks.id,
            plotId: deforestationChecks.plotId,
            provider: deforestationChecks.provider,
            cutOffDate: deforestationChecks.cutOffDate,
            performedAt: deforestationChecks.performedAt,
            deforestationDetected: deforestationChecks.deforestationDetected,
            hectaresLostAfterCutOff: deforestationChecks.hectaresLostAfterCutOff,
          })
          .from(deforestationChecks)
          .where(inArray(deforestationChecks.plotId, plotIds))
          .orderBy(desc(deforestationChecks.performedAt), desc(deforestationChecks.id));
  const latestByPlot = new Map<string, (typeof checksRaw)[number]>();
  for (const c of checksRaw) {
    if (!latestByPlot.has(c.plotId)) latestByPlot.set(c.plotId, c);
  }

  const eventsRaw = await db
    .select({
      id: events.id,
      type: events.type,
      emittedAt: events.emittedAt,
      emittedByDid: events.emittedByDid,
      payloadHash: events.payloadHash,
      onChainTopicId: events.onChainTopicId,
      onChainSequenceNumber: events.onChainSequenceNumber,
      onChainConsensusTimestamp: events.onChainConsensusTimestamp,
      onChainTransactionId: events.onChainTransactionId,
    })
    .from(events)
    .where(eq(events.batchId, share.batchId))
    .orderBy(desc(events.emittedAt));

  // Fire-and-forget access counter + last-accessed bump.
  void db
    .update(auditShares)
    .set({
      lastAccessedAt: sql`now()`,
      accessCount: sql`(${auditShares.accessCount}::bigint + 1)::text`,
    })
    .where(eq(auditShares.id, share.id))
    .catch((error) => {
      console.warn('[audit-share] failed to bump access counter', {
        shareId: share.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

  return {
    share: {
      id: share.id,
      label: share.label,
      expiresAt: share.expiresAt.toISOString(),
      accessCount: Number.parseInt(share.accessCount, 10) || 0,
    },
    operator: {
      legalName: operatorRow.displayName,
      role: operatorRow.role,
      country: operatorRow.country,
      subnational: operatorRow.subnational,
      did: operatorRow.did,
    },
    batch: {
      id: batchRow.id,
      commodity: batchRow.commodity,
      processingStage: batchRow.processingStage,
      quantity: batchRow.quantity,
      unit: batchRow.unit,
      productionStart: batchRow.productionStart.toISOString(),
      productionEnd: batchRow.productionEnd.toISOString(),
      status: batchRow.status,
      onChainTopicId: batchRow.onChainTopicId,
      onChainTokenId: batchRow.onChainTokenId,
      onChainSerialNumber:
        batchRow.onChainSerialNumber === null ? null : batchRow.onChainSerialNumber.toString(),
      onChainRegistryTxId: batchRow.onChainRegistryTxId,
    },
    plots: plotsRaw.map((p) => {
      const c = latestByPlot.get(p.id);
      return {
        id: p.id,
        country: p.country,
        subnational: p.subnational,
        commodities: p.commodities as string[],
        areaHectares: p.areaHectares,
        geometry: JSON.parse(p.geometryJson),
        deforestation: c
          ? {
              provider: c.provider,
              cutOffDate: c.cutOffDate.toISOString(),
              performedAt: c.performedAt.toISOString(),
              deforestationDetected: c.deforestationDetected,
              hectaresLostAfterCutOff: c.hectaresLostAfterCutOff,
            }
          : null,
      };
    }),
    events: eventsRaw.map((evt) => ({
      id: evt.id,
      type: evt.type,
      emittedAt: evt.emittedAt.toISOString(),
      emittedByDid: evt.emittedByDid,
      payloadHash: evt.payloadHash,
      onChainTopicId: evt.onChainTopicId,
      onChainSequenceNumber:
        evt.onChainSequenceNumber === null ? null : evt.onChainSequenceNumber.toString(),
      onChainConsensusTimestamp: evt.onChainConsensusTimestamp?.toISOString() ?? null,
      onChainTransactionId: evt.onChainTransactionId,
    })),
  };
}
