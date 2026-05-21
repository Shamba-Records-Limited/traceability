import { requireApiKey } from '../../../../../../lib/api-auth';
import { HandoffError, acceptHandoff } from '../../../../../../lib/handoff';

/**
 * POST /api/v1/handoffs/:id/accept
 *
 * Accept a previously-proposed handoff. Only the designated receiver
 * (the calling key's actor) can accept. Transfers custody, attempts an
 * HTS NFT transfer (soft failure), and emits a `handoff_received`
 * event.
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
    const result = await acceptHandoff({
      handoffId,
      toActorId: auth.key.actorId,
    });
    return Response.json({
      handoffId: result.handoffId,
      eventId: result.eventId,
      onChainTransferTxId: result.onChainTransferTxId,
      onChainTopicId: result.onChainTopicId,
    });
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
