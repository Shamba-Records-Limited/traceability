import { requireApiKey } from '../../../../../../lib/api-auth';
import { HandoffError, cancelHandoff } from '../../../../../../lib/handoff';

/**
 * POST /api/v1/handoffs/:id/cancel
 *
 * Cancel an outstanding handoff. Either the sender or receiver (the
 * calling key's actor) may cancel before the handoff has been
 * received. Idempotent — re-cancelling a cancelled handoff returns 200.
 *
 * Scopes: `handoffs:write`.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiKey(request, 'handoffs:write');
  if (auth.kind === 'response') return auth.response;

  const { id: handoffId } = await context.params;
  if (!/^[0-9a-f-]{32,36}$/i.test(handoffId)) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  try {
    await cancelHandoff({ handoffId, callerActorId: auth.key.actorId });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof HandoffError) {
      return Response.json(
        { error: 'handoff_failed', message: error.message },
        { status: error.status },
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: 'internal_error', message }, { status: 500 });
  }
}
