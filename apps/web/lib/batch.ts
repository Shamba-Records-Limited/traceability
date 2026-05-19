import { createHash, randomUUID } from 'node:crypto';

import { desc, eq, inArray } from 'drizzle-orm';

import { schema } from '@shamba/db';
import { type Commodity, commoditySchema, processingStageSchema } from '@shamba/shared-types';

import { db } from './db';
import { publishEvent } from './hedera-publisher';
import { mintBatchNft } from './hedera-mint';

const { actors, batches, batchPlots, batchParents, deforestationChecks, events, plots } = schema;

const BATCH_UNITS = ['kg', 'head', 'tonne', 'm3'] as const;
export type BatchUnit = (typeof BATCH_UNITS)[number];

export type ProcessingStage = 'raw' | 'primary_processed' | 'secondary_processed' | 'finished';

/**
 * Hard ceiling on the number of source plots a single batch can aggregate.
 * Plot ownership is checked one-by-one inside the transaction; an
 * unbounded list would let a malicious actor stall a connection. 200 is
 * higher than any cooperative we expect this MVP to serve and still
 * cheap enough that the in-transaction scan is irrelevant.
 */
const MAX_SOURCE_PLOTS = 200;

/**
 * Hard ceiling on parent batches for lineage edges (splits / merges). A
 * merge of more than 20 parents is operationally implausible; if a real
 * use-case ever surfaces we can raise it.
 */
const MAX_PARENT_BATCHES = 20;

export class BatchValidationError extends Error {
  readonly issues: ReadonlyArray<{ path: string; message: string }>;

  constructor(issues: ReadonlyArray<{ path: string; message: string }>) {
    super('batch input failed validation');
    this.issues = issues;
    this.name = 'BatchValidationError';
  }
}

export interface CreateBatchInput {
  custodianActorId: string;
  commodity: Commodity;
  processingStage: ProcessingStage;
  unit: BatchUnit;
  quantity: number;
  productionStart: Date;
  productionEnd: Date;
  sourcePlotIds: ReadonlyArray<string>;
  parentBatchIds?: ReadonlyArray<string>;
}

export interface CreatedBatch {
  id: string;
  custodianActorId: string;
  commodity: Commodity;
  processingStage: ProcessingStage;
  unit: BatchUnit;
  quantity: number;
  status: 'draft' | 'active';
  eventId: string;
  eventHash: string;
  /**
   * HCS topic the `batch_created` commitment was published to, or `null`
   * if the publisher was unreachable / soft-failed. `null` rows are
   * picked up by `reconcilePlotEvents` (events are polymorphic) on the
   * cron schedule.
   */
  onChainTopicId: string | null;
  /**
   * HTS collection token id the NFT was minted under, or `null` if the
   * mint soft-failed. `null` rows are picked up by `reconcileBatchMints`
   * on the cron schedule.
   */
  onChainTokenId: string | null;
  onChainSerialNumber: bigint | null;
}

function uuidLooksValid(value: string): boolean {
  // Minimal sanity check — let Postgres do the authoritative validation
  // when we read against it inside the transaction. This is just enough
  // to reject obvious nonsense before opening a connection.
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function validate(input: CreateBatchInput): Array<{ path: string; message: string }> {
  const issues: Array<{ path: string; message: string }> = [];

  if (!uuidLooksValid(input.custodianActorId)) {
    issues.push({ path: 'custodianActorId', message: 'must be a UUID' });
  }

  const commodity = commoditySchema.safeParse(input.commodity);
  if (!commodity.success) {
    issues.push({ path: 'commodity', message: 'unsupported commodity' });
  }

  const processingStage = processingStageSchema.safeParse(input.processingStage);
  if (!processingStage.success) {
    issues.push({ path: 'processingStage', message: 'unsupported processing stage' });
  }

  if (!BATCH_UNITS.includes(input.unit)) {
    issues.push({ path: 'unit', message: `unit must be one of ${BATCH_UNITS.join(', ')}` });
  }

  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    issues.push({ path: 'quantity', message: 'quantity must be a positive number' });
  }

  if (!(input.productionStart instanceof Date) || Number.isNaN(input.productionStart.getTime())) {
    issues.push({ path: 'productionStart', message: 'productionStart must be a valid Date' });
  }
  if (!(input.productionEnd instanceof Date) || Number.isNaN(input.productionEnd.getTime())) {
    issues.push({ path: 'productionEnd', message: 'productionEnd must be a valid Date' });
  }
  if (
    input.productionStart instanceof Date &&
    input.productionEnd instanceof Date &&
    !Number.isNaN(input.productionStart.getTime()) &&
    !Number.isNaN(input.productionEnd.getTime()) &&
    input.productionEnd.getTime() < input.productionStart.getTime()
  ) {
    issues.push({
      path: 'productionEnd',
      message: 'productionEnd must not be earlier than productionStart',
    });
  }

  if (!Array.isArray(input.sourcePlotIds) || input.sourcePlotIds.length === 0) {
    issues.push({ path: 'sourcePlotIds', message: 'at least one source plot is required' });
  } else if (input.sourcePlotIds.length > MAX_SOURCE_PLOTS) {
    issues.push({
      path: 'sourcePlotIds',
      message: `at most ${MAX_SOURCE_PLOTS} source plots per batch`,
    });
  } else {
    const seen = new Set<string>();
    input.sourcePlotIds.forEach((id, idx) => {
      if (!uuidLooksValid(id)) {
        issues.push({ path: `sourcePlotIds.${idx}`, message: 'must be a UUID' });
      } else if (seen.has(id)) {
        issues.push({ path: `sourcePlotIds.${idx}`, message: 'duplicate plot id' });
      }
      seen.add(id);
    });
  }

  if (input.parentBatchIds && input.parentBatchIds.length > 0) {
    if (input.parentBatchIds.length > MAX_PARENT_BATCHES) {
      issues.push({
        path: 'parentBatchIds',
        message: `at most ${MAX_PARENT_BATCHES} parent batches per child`,
      });
    }
    const seen = new Set<string>();
    input.parentBatchIds.forEach((id, idx) => {
      if (!uuidLooksValid(id)) {
        issues.push({ path: `parentBatchIds.${idx}`, message: 'must be a UUID' });
      } else if (seen.has(id)) {
        issues.push({ path: `parentBatchIds.${idx}`, message: 'duplicate parent batch id' });
      }
      seen.add(id);
    });
  }

  return issues;
}

/**
 * Create a batch from one or more plots' produce.
 *
 *   1. Validate the input (shape + dedup + bounds).
 *   2. Verify every source plot exists, is owned by the custodian, has a
 *      latest deforestation check that came back negative, and lists the
 *      target commodity among its commodities.
 *   3. Verify every parent batch (if any) exists and is owned by the
 *      custodian. Parent batches that are already `voided` are rejected.
 *   4. Persist `batches` (status 'draft'), `batch_plots`, `batch_parents`,
 *      and a `batch_created` event row in a single transaction.
 *   5. After the transaction commits, mint the HTS NFT via the publisher
 *      and publish the event commitment to HCS. Both are soft-failure:
 *      on failure the row stays in `draft` with `on_chain_*` null and
 *      the reconciler picks it up on the next tick. On mint success the
 *      row flips to `active`.
 */
export async function createBatch(input: CreateBatchInput): Promise<CreatedBatch> {
  const issues = validate(input);
  if (issues.length > 0) {
    throw new BatchValidationError(issues);
  }

  const sourcePlotIds = Array.from(new Set(input.sourcePlotIds));
  const parentBatchIds = input.parentBatchIds ? Array.from(new Set(input.parentBatchIds)) : [];

  // Look up the custodian's DID before opening the transaction so we
  // don't hold a connection while waiting on an actor lookup that
  // happens to be slow.
  const [actorRow] = await db
    .select({ did: actors.did })
    .from(actors)
    .where(eq(actors.id, input.custodianActorId))
    .limit(1);
  if (!actorRow) {
    throw new BatchValidationError([
      { path: 'custodianActorId', message: `actor ${input.custodianActorId} not found` },
    ]);
  }

  const plotRows = await db
    .select({
      id: plots.id,
      ownerActorId: plots.ownerActorId,
      commodities: plots.commodities,
    })
    .from(plots)
    .where(inArray(plots.id, sourcePlotIds));

  if (plotRows.length !== sourcePlotIds.length) {
    const found = new Set(plotRows.map((r) => r.id));
    const missing = sourcePlotIds.filter((id) => !found.has(id));
    throw new BatchValidationError(
      missing.map((id) => ({ path: 'sourcePlotIds', message: `plot ${id} not found` })),
    );
  }

  const validationIssues: Array<{ path: string; message: string }> = [];
  plotRows.forEach((row) => {
    if (row.ownerActorId !== input.custodianActorId) {
      validationIssues.push({
        path: 'sourcePlotIds',
        message: `plot ${row.id} is not owned by the custodian actor`,
      });
    }
    if (!row.commodities.includes(input.commodity)) {
      validationIssues.push({
        path: 'sourcePlotIds',
        message: `plot ${row.id} does not produce ${input.commodity}`,
      });
    }
  });
  if (validationIssues.length > 0) {
    throw new BatchValidationError(validationIssues);
  }

  // Every source plot must have at least one deforestation check whose
  // most recent verdict was negative. We pull the latest check per plot
  // ordered by performedAt desc, then assert each plot is represented
  // and verdict is false.
  const checks = await db
    .select({
      id: deforestationChecks.id,
      plotId: deforestationChecks.plotId,
      performedAt: deforestationChecks.performedAt,
      deforestationDetected: deforestationChecks.deforestationDetected,
      provider: deforestationChecks.provider,
    })
    .from(deforestationChecks)
    .where(inArray(deforestationChecks.plotId, sourcePlotIds))
    // `performedAt` resolution is milliseconds; ties are possible (especially
    // for the mock provider that stamps `new Date()` and could be invoked in
    // a tight loop). Tie-break on `id DESC` so the "latest" pick is
    // deterministic across runs.
    .orderBy(desc(deforestationChecks.performedAt), desc(deforestationChecks.id));

  const latestByPlot = new Map<string, (typeof checks)[number]>();
  for (const c of checks) {
    if (!latestByPlot.has(c.plotId)) latestByPlot.set(c.plotId, c);
  }
  const deforestationIssues: Array<{ path: string; message: string }> = [];
  for (const id of sourcePlotIds) {
    const c = latestByPlot.get(id);
    if (!c) {
      deforestationIssues.push({
        path: 'sourcePlotIds',
        message: `plot ${id} has no deforestation check on record`,
      });
    } else if (c.deforestationDetected) {
      deforestationIssues.push({
        path: 'sourcePlotIds',
        message: `plot ${id} failed its latest deforestation check (provider: ${c.provider})`,
      });
    }
  }
  if (deforestationIssues.length > 0) {
    throw new BatchValidationError(deforestationIssues);
  }

  // Validate parent batches.
  if (parentBatchIds.length > 0) {
    const parentRows = await db
      .select({
        id: batches.id,
        custodianActorId: batches.custodianActorId,
        status: batches.status,
      })
      .from(batches)
      .where(inArray(batches.id, parentBatchIds));
    if (parentRows.length !== parentBatchIds.length) {
      const found = new Set(parentRows.map((r) => r.id));
      const missing = parentBatchIds.filter((id) => !found.has(id));
      throw new BatchValidationError(
        missing.map((id) => ({ path: 'parentBatchIds', message: `batch ${id} not found` })),
      );
    }
    const parentIssues: Array<{ path: string; message: string }> = [];
    parentRows.forEach((row) => {
      if (row.custodianActorId !== input.custodianActorId) {
        parentIssues.push({
          path: 'parentBatchIds',
          message: `batch ${row.id} is not owned by the custodian actor`,
        });
      }
      if (row.status === 'voided') {
        parentIssues.push({
          path: 'parentBatchIds',
          message: `batch ${row.id} is voided and cannot be a lineage parent`,
        });
      }
    });
    if (parentIssues.length > 0) {
      throw new BatchValidationError(parentIssues);
    }
  }

  const eventId = randomUUID();
  const now = new Date();

  const { batchId, payloadHash, eventCommitment } = await db.transaction(async (tx) => {
    const [batchRow] = await tx
      .insert(batches)
      .values({
        commodity: input.commodity,
        processingStage: input.processingStage,
        unit: input.unit,
        quantity: input.quantity,
        productionStart: input.productionStart,
        productionEnd: input.productionEnd,
        custodianActorId: input.custodianActorId,
        status: 'draft',
      })
      .returning({ id: batches.id });
    if (!batchRow) {
      throw new Error('batch insert returned no rows');
    }

    await tx
      .insert(batchPlots)
      .values(sourcePlotIds.map((plotId) => ({ batchId: batchRow.id, plotId })));

    if (parentBatchIds.length > 0) {
      await tx.insert(batchParents).values(
        parentBatchIds.map((parentBatchId) => ({
          childBatchId: batchRow.id,
          parentBatchId,
        })),
      );
    }

    const eventPayload = {
      v: 1 as const,
      type: 'batch_created' as const,
      batchId: batchRow.id,
      custodianActorId: input.custodianActorId,
      custodianDid: actorRow.did,
      commodity: input.commodity,
      processingStage: input.processingStage,
      unit: input.unit,
      quantity: input.quantity,
      productionStart: input.productionStart.toISOString(),
      productionEnd: input.productionEnd.toISOString(),
      sourcePlotIds,
      parentBatchIds,
      emittedAt: now.toISOString(),
    };
    const canonical = JSON.stringify(eventPayload);
    const payloadHashInner = createHash('sha256').update(canonical, 'utf8').digest('hex');

    await tx.insert(events).values({
      id: eventId,
      batchId: batchRow.id,
      type: 'batch_created',
      emittedAt: now,
      emittedByDid: actorRow.did,
      payload: eventPayload,
      payloadHash: payloadHashInner,
    });

    const commitment = {
      v: 1 as const,
      type: 'batch_created' as const,
      batchId: batchRow.id,
      emittedAt: now.toISOString(),
      emittedByDid: actorRow.did,
      payloadHash: payloadHashInner,
    };

    return {
      batchId: batchRow.id,
      payloadHash: payloadHashInner,
      eventCommitment: commitment,
    };
  });

  // Post-commit on-chain work. Done OUTSIDE the transaction so a slow or
  // unreachable publisher does not hold a database connection. Both
  // operations are soft-failure: pending rows are reconciled later.
  const mintInput = {
    tokenId: '',
    name: `Shamba Batch ${batchId.slice(0, 8)}`,
    symbol: 'SHAMBA-BATCH',
    metadata: { batchId, payloadHash, schemaVersion: 1 },
  };
  const mint = await mintBatchNft(mintInput);
  const publish = await publishEvent('', eventCommitment);

  if (mint || publish) {
    // The on-chain calls already landed. If the DB backfill fails we
    // would otherwise leave the row pending and let the reconciler
    // re-mint / re-publish — which would create a duplicate NFT and a
    // duplicate HCS message because neither the publisher nor the HCS
    // submit are idempotent today. Mitigate by retrying the local
    // transaction with bounded backoff before giving up. A loud error
    // log surfaces the split-brain case (rare: requires three DB
    // failures in a row right after a successful on-chain call). The
    // durable fix is a mint-requests outbox keyed by batchId +
    // payloadHash + publisher-side dedup; tracked as a follow-up.
    let backfilled = false;
    const backoffMs = [0, 200, 800];
    for (let attempt = 0; attempt < backoffMs.length && !backfilled; attempt += 1) {
      if (backoffMs[attempt]! > 0) {
        await new Promise((r) => setTimeout(r, backoffMs[attempt]));
      }
      try {
        await db.transaction(async (tx) => {
          if (mint) {
            await tx
              .update(batches)
              .set({
                onChainTokenId: mint.tokenId,
                onChainSerialNumber: mint.serialNumber,
                onChainMintTransactionId: mint.transactionId,
                status: 'active',
                updatedAt: new Date(),
              })
              .where(eq(batches.id, batchId));
          }
          if (publish) {
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
              .update(batches)
              .set({ onChainTopicId: publish.topicId, updatedAt: new Date() })
              .where(eq(batches.id, batchId));
          }
        });
        backfilled = true;
      } catch (error) {
        if (attempt === backoffMs.length - 1) {
          console.error(
            '[batch] on-chain commit succeeded but DB backfill failed after retries; row is in split-brain (NFT minted on Hedera but DB columns NULL), reconciler will retry and may produce a duplicate NFT',
            {
              batchId,
              eventId,
              mintedTokenId: mint?.tokenId,
              mintedSerial: mint?.serialNumber.toString(),
              mintTransactionId: mint?.transactionId,
              publishTopicId: publish?.topicId,
              attempts: backoffMs.length,
              error: error instanceof Error ? error.message : String(error),
            },
          );
        }
      }
    }
  }

  return {
    id: batchId,
    custodianActorId: input.custodianActorId,
    commodity: input.commodity,
    processingStage: input.processingStage,
    unit: input.unit,
    quantity: input.quantity,
    status: mint ? 'active' : 'draft',
    eventId,
    eventHash: payloadHash,
    onChainTopicId: publish?.topicId ?? null,
    onChainTokenId: mint?.tokenId ?? null,
    onChainSerialNumber: mint?.serialNumber ?? null,
  };
}

/**
 * List batches whose custodian is the given actor, newest first.
 */
export async function listBatchesForActor(custodianActorId: string): Promise<
  Array<{
    id: string;
    commodity: Commodity;
    processingStage: ProcessingStage;
    unit: BatchUnit;
    quantity: number;
    productionStart: Date;
    productionEnd: Date;
    status: 'draft' | 'active' | 'consumed' | 'exhausted' | 'voided';
    onChainTokenId: string | null;
    onChainSerialNumber: bigint | null;
    onChainTopicId: string | null;
    createdAt: Date;
  }>
> {
  const rows = await db
    .select({
      id: batches.id,
      commodity: batches.commodity,
      processingStage: batches.processingStage,
      unit: batches.unit,
      quantity: batches.quantity,
      productionStart: batches.productionStart,
      productionEnd: batches.productionEnd,
      status: batches.status,
      onChainTokenId: batches.onChainTokenId,
      onChainSerialNumber: batches.onChainSerialNumber,
      onChainTopicId: batches.onChainTopicId,
      createdAt: batches.createdAt,
    })
    .from(batches)
    .where(eq(batches.custodianActorId, custodianActorId))
    .orderBy(desc(batches.createdAt))
    .limit(100);

  return rows.map((row) => ({
    ...row,
    commodity: row.commodity as Commodity,
    processingStage: row.processingStage as ProcessingStage,
    unit: row.unit as BatchUnit,
  }));
}

/**
 * Return source plots eligible to back a new batch — that is, plots
 * owned by the custodian whose most-recent deforestation check came
 * back negative. Used to populate the batch creation form so users only
 * see plots they can actually use.
 */
export async function listEligibleSourcePlotsForActor(custodianActorId: string): Promise<
  Array<{
    id: string;
    country: string;
    subnational: string | null;
    commodities: Commodity[];
    areaHectares: number;
    registeredAt: Date;
  }>
> {
  const ownPlots = await db
    .select({
      id: plots.id,
      country: plots.country,
      subnational: plots.subnational,
      commodities: plots.commodities,
      areaHectares: plots.areaHectares,
      registeredAt: plots.registeredAt,
    })
    .from(plots)
    .where(eq(plots.ownerActorId, custodianActorId))
    .orderBy(desc(plots.registeredAt))
    .limit(500);

  if (ownPlots.length === 0) return [];

  const checks = await db
    .select({
      id: deforestationChecks.id,
      plotId: deforestationChecks.plotId,
      performedAt: deforestationChecks.performedAt,
      deforestationDetected: deforestationChecks.deforestationDetected,
    })
    .from(deforestationChecks)
    .where(
      inArray(
        deforestationChecks.plotId,
        ownPlots.map((p) => p.id),
      ),
    )
    // Mirror the tiebreaker from `createBatch` so the eligible-plots
    // listing agrees with what the validation layer accepts.
    .orderBy(desc(deforestationChecks.performedAt), desc(deforestationChecks.id));

  const latestByPlot = new Map<string, (typeof checks)[number]>();
  for (const c of checks) {
    if (!latestByPlot.has(c.plotId)) latestByPlot.set(c.plotId, c);
  }

  return ownPlots
    .filter((p) => {
      const latest = latestByPlot.get(p.id);
      return latest && !latest.deforestationDetected;
    })
    .map((p) => ({
      id: p.id,
      country: p.country,
      subnational: p.subnational,
      commodities: p.commodities as Commodity[],
      areaHectares: p.areaHectares,
      registeredAt: p.registeredAt,
    }));
}
