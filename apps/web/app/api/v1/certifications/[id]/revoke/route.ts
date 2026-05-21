import { requireApiKey } from '../../../../../../lib/api-auth';
import { revokeCertification } from '../../../../../../lib/certification';

/**
 * POST /api/v1/certifications/:id/revoke
 *
 * Soft-revoke a certification the calling key's actor attested.
 * `revokeCertification` returns false when the row doesn't exist, is
 * already revoked, or belongs to another actor — we collapse all three
 * into a single 404 so the API does not leak existence.
 *
 * Scopes: `certifications:write`.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiKey(request, 'certifications:write');
  if (auth.kind === 'response') return auth.response;

  const { id } = await context.params;
  if (!/^[0-9a-f-]{32,36}$/i.test(id)) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const ok = await revokeCertification({ certificationId: id, actorId: auth.key.actorId });
  if (!ok) return Response.json({ error: 'not_found' }, { status: 404 });
  return Response.json({ ok: true });
}
