import { and, eq } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { db } from '../../../../../lib/db';
import { requireApiKey } from '../../../../../lib/api-auth';

const { batches, batchPlots, batchParents } = schema;

/**
 * GET /api/v1/batches/:id
 *
 * Single-batch detail including source plot ids and lineage parents
 * (immediate ancestors only — full multi-hop lineage lives at
 * /api/v1/batches/:id/lineage).
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiKey(request, 'batches:read');
  if (auth.kind === 'response') return auth.response;

  const { id } = await context.params;
  if (!/^[0-9a-f-]{32,36}$/i.test(id)) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const [row] = await db
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
    .where(and(eq(batches.id, id), eq(batches.custodianActorId, auth.key.actorId)))
    .limit(1);

  if (!row) return Response.json({ error: 'not_found' }, { status: 404 });

  const plotsRows = await db
    .select({ plotId: batchPlots.plotId })
    .from(batchPlots)
    .where(eq(batchPlots.batchId, id));

  const parentsRows = await db
    .select({ parentBatchId: batchParents.parentBatchId })
    .from(batchParents)
    .where(eq(batchParents.childBatchId, id));

  return Response.json({
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
    sourcePlotIds: plotsRows.map((p) => p.plotId),
    parentBatchIds: parentsRows.map((p) => p.parentBatchId),
    createdAt: row.createdAt.toISOString(),
  });
}
