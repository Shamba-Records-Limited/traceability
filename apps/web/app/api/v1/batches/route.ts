import { and, desc, eq, lt, or } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { db } from '../../../../lib/db';
import { requireApiKey } from '../../../../lib/api-auth';
import { decodeCursor, encodeCursor, parseLimit } from '../../../../lib/api-pagination';

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
