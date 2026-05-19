import { and, desc, eq, lt, or } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { db } from '../../../../lib/db';
import { requireApiKey } from '../../../../lib/api-auth';
import { decodeCursor, encodeCursor, parseLimit } from '../../../../lib/api-pagination';

const { plots } = schema;

/**
 * GET /api/v1/plots
 *
 * Cursor-paginated list of plots owned by the calling key's actor.
 * Scopes: `plots:read`.
 *
 * Query params:
 *   - limit: 1..200, default 50
 *   - cursor: opaque base64url string from a previous response's `nextCursor`
 *
 * Response shape:
 *   {
 *     data: Plot[],
 *     nextCursor: string | null,
 *     limit: number
 *   }
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await requireApiKey(request, 'plots:read');
  if (auth.kind === 'response') return auth.response;

  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get('limit'));
  const cursor = decodeCursor(url.searchParams.get('cursor'));

  // Stable order: (registered_at DESC, id DESC). Cursor predicate is
  // "row's registered_at is strictly before the cursor's createdAt, OR
  // equal createdAt with strictly lower id" — keeps pagination stable
  // under concurrent inserts.
  const cursorPredicate = cursor
    ? or(
        lt(plots.registeredAt, new Date(cursor.createdAt)),
        and(eq(plots.registeredAt, new Date(cursor.createdAt)), lt(plots.id, cursor.id)),
      )
    : undefined;

  const rows = await db
    .select({
      id: plots.id,
      ownerActorId: plots.ownerActorId,
      country: plots.country,
      subnational: plots.subnational,
      commodities: plots.commodities,
      areaHectares: plots.areaHectares,
      onChainCommitmentTopicId: plots.onChainCommitmentTopicId,
      registeredAt: plots.registeredAt,
      createdAt: plots.createdAt,
    })
    .from(plots)
    .where(and(eq(plots.ownerActorId, auth.key.actorId), cursorPredicate))
    .orderBy(desc(plots.registeredAt), desc(plots.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ createdAt: last.registeredAt.toISOString(), id: last.id })
      : null;

  return Response.json({
    data: page.map((row) => ({
      id: row.id,
      ownerActorId: row.ownerActorId,
      country: row.country,
      subnational: row.subnational,
      commodities: row.commodities,
      areaHectares: row.areaHectares,
      onChainCommitmentTopicId: row.onChainCommitmentTopicId,
      registeredAt: row.registeredAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    })),
    nextCursor,
    limit,
  });
}
