import { and, eq } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { db } from '../../../../../../lib/db';
import { requireApiKey } from '../../../../../../lib/api-auth';
import { DdsGenerationError, generateDdsBundle } from '../../../../../../lib/dds';

const { batches } = schema;

/**
 * POST /api/v1/batches/:id/dds
 *
 * Issues a Due Diligence Statement bundle for the batch and returns
 * the canonical JSON. Side effect: emits a `dds_issued` event with
 * the bundle's contentHash committed to HCS so the issuance itself is
 * audit-trail-grade.
 *
 * Scope: `dds:read`. Only the current custodian (= the calling key's
 * actor) can issue a DDS; cross-actor requests return 404 to avoid
 * existence-disclosure.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiKey(request, 'dds:read');
  if (auth.kind === 'response') return auth.response;

  const { id } = await context.params;
  if (!/^[0-9a-f-]{32,36}$/i.test(id)) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  // Existence + ownership pre-check so we can short-circuit with 404
  // instead of letting the generator throw 403 (which would leak the
  // existence of another actor's batch).
  const [own] = await db
    .select({ id: batches.id })
    .from(batches)
    .where(and(eq(batches.id, id), eq(batches.custodianActorId, auth.key.actorId)))
    .limit(1);
  if (!own) return Response.json({ error: 'not_found' }, { status: 404 });

  try {
    const result = await generateDdsBundle({
      batchId: id,
      operatorActorId: auth.key.actorId,
    });
    return Response.json({
      bundle: result.bundle,
      eventId: result.eventId,
      onChainTopicId: result.onChainTopicId,
    });
  } catch (error) {
    if (error instanceof DdsGenerationError) {
      return Response.json(
        { error: 'dds_generation_failed', message: error.message },
        {
          status: error.status,
        },
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: 'internal_error', message }, { status: 500 });
  }
}
