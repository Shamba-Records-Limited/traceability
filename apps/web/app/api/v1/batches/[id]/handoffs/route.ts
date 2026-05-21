import { requireApiKey } from '../../../../../../lib/api-auth';
import { HandoffError, proposeHandoff } from '../../../../../../lib/handoff';

/**
 * POST /api/v1/batches/:id/handoffs
 *
 * Propose a custody transfer for the batch from the calling key's
 * actor (the current custodian) to the receiver identified by
 * `toActorDid`. The receiver must already be onboarded — i.e. have a
 * registered DID. Mirrors the dashboard's propose-handoff flow.
 *
 * Scopes: `handoffs:write`.
 *
 * Request body:
 *   {
 *     toActorDid: string,
 *     quantity: number,         // > 0, must not exceed batch.quantity
 *     unit: 'kg' | 'head' | 'tonne' | 'm3',  // must match batch.unit
 *     notes?: string
 *   }
 *
 * Response (201):
 *   { handoffId, eventId, onChainTopicId }
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiKey(request, 'handoffs:write');
  if (auth.kind === 'response') return auth.response;

  const { id: batchId } = await context.params;
  if (!/^[0-9a-f-]{32,36}$/i.test(batchId)) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

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

  const { toActorDid, quantity, unit, notes } = body as Record<string, unknown>;
  if (typeof toActorDid !== 'string' || !toActorDid.trim()) {
    return Response.json(
      { error: 'validation_failed', message: 'toActorDid is required' },
      { status: 400 },
    );
  }

  try {
    const result = await proposeHandoff({
      batchId,
      fromActorId: auth.key.actorId,
      toActorDid: toActorDid.trim(),
      quantity: typeof quantity === 'number' ? quantity : Number.NaN,
      unit: unit as Parameters<typeof proposeHandoff>[0]['unit'],
      notes: typeof notes === 'string' ? notes : undefined,
    });
    return Response.json(
      {
        handoffId: result.handoffId,
        eventId: result.eventId,
        onChainTopicId: result.onChainTopicId,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof HandoffError) {
      // 403/409 from HandoffError are deliberately preserved here. We
      // do NOT mask them as 404: the caller IS the current custodian
      // (else they'd not have produced the batchId from a list call),
      // so leaking ownership state via 403/409 is not a concern.
      return Response.json(
        { error: 'handoff_failed', message: error.message },
        { status: error.status },
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: 'internal_error', message }, { status: 500 });
  }
}
