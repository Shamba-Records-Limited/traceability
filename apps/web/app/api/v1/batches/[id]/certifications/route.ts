import { and, eq } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { db } from '../../../../../../lib/db';
import { requireApiKey } from '../../../../../../lib/api-auth';
import {
  CERTIFICATION_SCHEMES,
  CertificationError,
  attachCertification,
  listCertificationsForBatch,
  type CertificationScheme,
} from '../../../../../../lib/certification';

const { batches } = schema;

/**
 * GET /api/v1/batches/:id/certifications
 *
 * List voluntary-scheme certifications attached to the batch. The
 * calling key's actor must be the current custodian; we return 404
 * otherwise to avoid leaking the existence of other custodians' batches.
 *
 * Scopes: `certifications:read`.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiKey(request, 'certifications:read');
  if (auth.kind === 'response') return auth.response;

  const { id: batchId } = await context.params;
  if (!/^[0-9a-f-]{32,36}$/i.test(batchId)) {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  const [own] = await db
    .select({ id: batches.id })
    .from(batches)
    .where(and(eq(batches.id, batchId), eq(batches.custodianActorId, auth.key.actorId)))
    .limit(1);
  if (!own) return Response.json({ error: 'not_found' }, { status: 404 });

  const rows = await listCertificationsForBatch(batchId);
  return Response.json({
    data: rows.map((row) => ({
      id: row.id,
      scheme: row.scheme,
      issuer: row.issuer,
      certificateNumber: row.certificateNumber,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      evidenceUri: row.evidenceUri,
      notes: row.notes,
      attestedAt: row.attestedAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
    })),
  });
}

/**
 * POST /api/v1/batches/:id/certifications
 *
 * Attach a voluntary-scheme certification (Fair Trade, Rainforest
 * Alliance, organic, etc.) to the batch. Only the current custodian
 * may attach. Same payload-hash + HCS commitment pattern as the rest
 * of the audit trail.
 *
 * Scopes: `certifications:write`.
 *
 * Request body:
 *   {
 *     scheme: CertificationScheme,
 *     issuer: string,
 *     certificateNumber: string,
 *     validFrom: string,          // ISO date (YYYY-MM-DD)
 *     validUntil: string,         // ISO date (YYYY-MM-DD)
 *     evidenceUri?: string,
 *     notes?: string,
 *     payload?: Record<string, unknown>
 *   }
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiKey(request, 'certifications:write');
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

  const { scheme, issuer, certificateNumber, validFrom, validUntil, evidenceUri, notes, payload } =
    body as Record<string, unknown>;

  if (
    typeof scheme !== 'string' ||
    !CERTIFICATION_SCHEMES.includes(scheme as CertificationScheme)
  ) {
    return Response.json(
      { error: 'validation_failed', message: 'scheme is required and must be a supported scheme' },
      { status: 400 },
    );
  }
  if (typeof issuer !== 'string' || !issuer.trim()) {
    return Response.json(
      { error: 'validation_failed', message: 'issuer is required' },
      { status: 400 },
    );
  }
  if (typeof certificateNumber !== 'string' || !certificateNumber.trim()) {
    return Response.json(
      { error: 'validation_failed', message: 'certificateNumber is required' },
      { status: 400 },
    );
  }
  const from = typeof validFrom === 'string' ? new Date(validFrom) : new Date(NaN);
  const until = typeof validUntil === 'string' ? new Date(validUntil) : new Date(NaN);
  if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime())) {
    return Response.json(
      { error: 'validation_failed', message: 'validFrom / validUntil must be ISO date strings' },
      { status: 400 },
    );
  }

  try {
    const result = await attachCertification({
      batchId,
      attestedByActorId: auth.key.actorId,
      scheme: scheme as CertificationScheme,
      issuer,
      certificateNumber,
      validFrom: from,
      validUntil: until,
      evidenceUri: typeof evidenceUri === 'string' ? evidenceUri : null,
      notes: typeof notes === 'string' ? notes : null,
      payload:
        payload && typeof payload === 'object' && !Array.isArray(payload)
          ? (payload as Record<string, unknown>)
          : undefined,
    });
    return Response.json(
      {
        certificationId: result.certificationId,
        eventId: result.eventId,
        onChainTopicId: result.onChainTopicId,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof CertificationError) {
      return Response.json(
        { error: 'certification_failed', message: error.message },
        { status: error.status },
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: 'internal_error', message }, { status: 500 });
  }
}
