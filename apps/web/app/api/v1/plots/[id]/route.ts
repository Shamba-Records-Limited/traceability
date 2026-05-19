import { and, desc, eq } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { db } from '../../../../../lib/db';
import { requireApiKey } from '../../../../../lib/api-auth';

const { plots, deforestationChecks } = schema;

/**
 * GET /api/v1/plots/:id
 *
 * Single-plot detail including the latest deforestation check, the
 * on-chain commitment topic id, and audit-trail fields. 404 if the
 * caller's actor does not own the plot — we deliberately return the
 * same status as "not found" so the API does not leak the existence of
 * other actors' plots.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiKey(request, 'plots:read');
  if (auth.kind === 'response') return auth.response;

  const { id } = await context.params;
  if (!/^[0-9a-f-]{32,36}$/i.test(id)) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const [row] = await db
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
    .where(and(eq(plots.id, id), eq(plots.ownerActorId, auth.key.actorId)))
    .limit(1);

  if (!row) return Response.json({ error: 'not_found' }, { status: 404 });

  const [latestCheck] = await db
    .select({
      id: deforestationChecks.id,
      provider: deforestationChecks.provider,
      providerVersion: deforestationChecks.providerVersion,
      cutOffDate: deforestationChecks.cutOffDate,
      performedAt: deforestationChecks.performedAt,
      deforestationDetected: deforestationChecks.deforestationDetected,
      hectaresLostAfterCutOff: deforestationChecks.hectaresLostAfterCutOff,
    })
    .from(deforestationChecks)
    .where(eq(deforestationChecks.plotId, id))
    .orderBy(desc(deforestationChecks.performedAt), desc(deforestationChecks.id))
    .limit(1);

  return Response.json({
    id: row.id,
    ownerActorId: row.ownerActorId,
    country: row.country,
    subnational: row.subnational,
    commodities: row.commodities,
    areaHectares: row.areaHectares,
    onChainCommitmentTopicId: row.onChainCommitmentTopicId,
    registeredAt: row.registeredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    latestDeforestationCheck: latestCheck
      ? {
          id: latestCheck.id,
          provider: latestCheck.provider,
          providerVersion: latestCheck.providerVersion,
          cutOffDate: latestCheck.cutOffDate.toISOString(),
          performedAt: latestCheck.performedAt.toISOString(),
          deforestationDetected: latestCheck.deforestationDetected,
          hectaresLostAfterCutOff: latestCheck.hectaresLostAfterCutOff,
        }
      : null,
  });
}
