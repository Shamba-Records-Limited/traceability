import { and, desc, eq, lt, or } from 'drizzle-orm';

import { schema } from '@shamba/db';
import { plotGeometrySchema, type PlotGeometry, commoditySchema } from '@shamba/shared-types';

import { db } from '../../../../lib/db';
import { requireApiKey } from '../../../../lib/api-auth';
import { decodeCursor, encodeCursor, parseLimit } from '../../../../lib/api-pagination';
import { PlotValidationError, registerPlot } from '../../../../lib/plot';

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
        lt(plots.registeredAt, new Date(cursor.sortAt)),
        and(eq(plots.registeredAt, new Date(cursor.sortAt)), lt(plots.id, cursor.id)),
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
    hasMore && last ? encodeCursor({ sortAt: last.registeredAt.toISOString(), id: last.id }) : null;

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

/**
 * POST /api/v1/plots
 *
 * Register a new plot on the calling key's actor. Thin wrapper around
 * `registerPlot` in `lib/plot.ts` — same validation, same deforestation
 * provider run, same on-chain publish lifecycle. The plot owner is
 * derived from the API key's actor; integrators cannot register plots
 * for other actors via this endpoint.
 *
 * Scopes: `plots:write`.
 *
 * Request body:
 *   {
 *     country: string,           // ISO 3166-1 alpha-2
 *     subnational?: string,
 *     commodities: string[],
 *     geometry: PlotGeometry     // GeoJSON Point or Polygon (WGS 84)
 *   }
 *
 * Response (201):
 *   {
 *     id, ownerActorId, country, commodities, areaHectares,
 *     deforestationDetected, eventId, eventHash, onChainTopicId
 *   }
 *
 * Errors:
 *   - 400 `validation_failed` — input failed shape / geometry / commodity validation
 *   - 401/403 — auth failures (returned by requireApiKey)
 *   - 500 `internal_error` — unexpected failure (DB / provider)
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireApiKey(request, 'plots:write');
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

  const { country, subnational, commodities, geometry } = body as {
    country?: unknown;
    subnational?: unknown;
    commodities?: unknown;
    geometry?: unknown;
  };

  if (typeof country !== 'string') {
    return Response.json(
      { error: 'validation_failed', issues: [{ path: 'country', message: 'country is required' }] },
      { status: 400 },
    );
  }
  if (!Array.isArray(commodities) || commodities.length === 0) {
    return Response.json(
      {
        error: 'validation_failed',
        issues: [{ path: 'commodities', message: 'commodities must be a non-empty array' }],
      },
      { status: 400 },
    );
  }
  // Up-front per-element commodity validation so the caller gets a
  // 400 with a clear pointer; `registerPlot` will also re-validate.
  const commodityIssues: Array<{ path: string; message: string }> = [];
  commodities.forEach((c, idx) => {
    if (!commoditySchema.safeParse(c).success) {
      commodityIssues.push({ path: `commodities.${idx}`, message: 'unsupported commodity' });
    }
  });
  if (commodityIssues.length > 0) {
    return Response.json({ error: 'validation_failed', issues: commodityIssues }, { status: 400 });
  }

  const geometryParsed = plotGeometrySchema.safeParse(geometry);
  if (!geometryParsed.success) {
    return Response.json(
      {
        error: 'validation_failed',
        issues: geometryParsed.error.issues.map((i) => ({
          path: `geometry.${i.path.join('.')}`,
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const plot = await registerPlot({
      ownerActorId: auth.key.actorId,
      country,
      subnational: typeof subnational === 'string' ? subnational : undefined,
      commodities: commodities as ReadonlyArray<(typeof commodities)[number]>,
      geometry: geometryParsed.data as PlotGeometry,
    });

    return Response.json(
      {
        id: plot.id,
        ownerActorId: plot.ownerActorId,
        country: plot.country,
        commodities: plot.commodities,
        areaHectares: plot.areaHectares,
        deforestationDetected: plot.deforestationDetected,
        eventId: plot.eventId,
        eventHash: plot.eventHash,
        onChainTopicId: plot.onChainTopicId,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof PlotValidationError) {
      return Response.json({ error: 'validation_failed', issues: error.issues }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: 'internal_error', message }, { status: 500 });
  }
}
