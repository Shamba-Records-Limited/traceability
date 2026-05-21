import { and, desc, eq, lt, or } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { db } from '../../../../lib/db';
import { requireApiKey } from '../../../../lib/api-auth';
import { decodeCursor, encodeCursor, parseLimit } from '../../../../lib/api-pagination';
import {
  BatchValidationError,
  createBatch,
  type BatchUnit,
  type ProcessingStage,
} from '../../../../lib/batch';

const { batches } = schema;

/**
 * GET /api/v1/batches
 *
 * Cursor-paginated list of batches in the calling key's actor's custody.
 * Scopes: `batches:read`.
 *
 * Query params:
 *   - limit, cursor: see `lib/api-pagination`
 *
 * `onChainSerialNumber` is returned as a string in JSON because HTS
 * serials can exceed `Number.MAX_SAFE_INTEGER` over a collection's
 * lifetime; sending them as bigint-ish strings keeps integrators safe.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await requireApiKey(request, 'batches:read');
  if (auth.kind === 'response') return auth.response;

  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get('limit'));
  const cursor = decodeCursor(url.searchParams.get('cursor'));

  const cursorPredicate = cursor
    ? or(
        lt(batches.createdAt, new Date(cursor.sortAt)),
        and(eq(batches.createdAt, new Date(cursor.sortAt)), lt(batches.id, cursor.id)),
      )
    : undefined;

  const rows = await db
    .select({
      id: batches.id,
      commodity: batches.commodity,
      processingStage: batches.processingStage,
      unit: batches.unit,
      quantity: batches.quantity,
      productionStart: batches.productionStart,
      productionEnd: batches.productionEnd,
      custodianActorId: batches.custodianActorId,
      status: batches.status,
      onChainTopicId: batches.onChainTopicId,
      onChainTokenId: batches.onChainTokenId,
      onChainSerialNumber: batches.onChainSerialNumber,
      onChainMintTransactionId: batches.onChainMintTransactionId,
      createdAt: batches.createdAt,
    })
    .from(batches)
    .where(and(eq(batches.custodianActorId, auth.key.actorId), cursorPredicate))
    .orderBy(desc(batches.createdAt), desc(batches.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor({ sortAt: last.createdAt.toISOString(), id: last.id }) : null;

  return Response.json({
    data: page.map((row) => ({
      id: row.id,
      commodity: row.commodity,
      processingStage: row.processingStage,
      unit: row.unit,
      quantity: row.quantity,
      productionStart: row.productionStart.toISOString(),
      productionEnd: row.productionEnd.toISOString(),
      custodianActorId: row.custodianActorId,
      status: row.status,
      onChainTopicId: row.onChainTopicId,
      onChainTokenId: row.onChainTokenId,
      onChainSerialNumber:
        row.onChainSerialNumber === null ? null : row.onChainSerialNumber.toString(),
      onChainMintTransactionId: row.onChainMintTransactionId,
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor,
    limit,
  });
}

/**
 * POST /api/v1/batches
 *
 * Create a batch with the calling key's actor as the custodian. Thin
 * wrapper around `createBatch` in `lib/batch.ts`; all source plots and
 * parent batches MUST already belong to the calling actor (enforced by
 * `createBatch`). On success the row starts in `draft` and flips to
 * `active` once the HTS NFT mint lands; on mint soft-failure the row
 * stays `draft` and the reconciler retries.
 *
 * Scopes: `batches:write`.
 *
 * Request body:
 *   {
 *     commodity: Commodity,
 *     processingStage: ProcessingStage,
 *     unit: BatchUnit,            // 'kg' | 'head' | 'tonne' | 'm3'
 *     quantity: number,           // > 0
 *     productionStart: string,    // ISO 8601 date-time
 *     productionEnd: string,      // ISO 8601 date-time
 *     sourcePlotIds: string[],    // owned by calling actor
 *     parentBatchIds?: string[]
 *   }
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireApiKey(request, 'batches:write');
  if (auth.kind === 'response') return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'invalid_json', message: 'request body must be valid JSON' },
      { status: 400 },
    );
  }

  if (!body || typeof body !== 'object') {
    return Response.json(
      { error: 'invalid_body', message: 'request body must be a JSON object' },
      { status: 400 },
    );
  }

  const {
    commodity,
    processingStage,
    unit,
    quantity,
    productionStart,
    productionEnd,
    sourcePlotIds,
    parentBatchIds,
  } = body as Record<string, unknown>;

  // `createBatch` does deep validation; we just guard the type-narrowing
  // here so we can construct its strongly-typed input. Anything that
  // slips through becomes a 400 via BatchValidationError below.
  const start = typeof productionStart === 'string' ? new Date(productionStart) : new Date(NaN);
  const end = typeof productionEnd === 'string' ? new Date(productionEnd) : new Date(NaN);

  try {
    const created = await createBatch({
      custodianActorId: auth.key.actorId,
      commodity: commodity as Parameters<typeof createBatch>[0]['commodity'],
      processingStage: processingStage as ProcessingStage,
      unit: unit as BatchUnit,
      quantity: typeof quantity === 'number' ? quantity : Number.NaN,
      productionStart: start,
      productionEnd: end,
      sourcePlotIds: Array.isArray(sourcePlotIds) ? (sourcePlotIds as string[]) : [],
      parentBatchIds: Array.isArray(parentBatchIds) ? (parentBatchIds as string[]) : undefined,
    });

    return Response.json(
      {
        id: created.id,
        custodianActorId: created.custodianActorId,
        commodity: created.commodity,
        processingStage: created.processingStage,
        unit: created.unit,
        quantity: created.quantity,
        status: created.status,
        eventId: created.eventId,
        eventHash: created.eventHash,
        onChainTopicId: created.onChainTopicId,
        onChainTokenId: created.onChainTokenId,
        onChainSerialNumber:
          created.onChainSerialNumber === null ? null : created.onChainSerialNumber.toString(),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof BatchValidationError) {
      return Response.json({ error: 'validation_failed', issues: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: 'internal_error', message }, { status: 500 });
  }
}
