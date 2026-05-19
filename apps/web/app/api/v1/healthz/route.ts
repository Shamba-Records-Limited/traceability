/**
 * GET /api/v1/healthz
 *
 * Unauthenticated liveness probe for integrators and the platform's own
 * uptime monitors. Returns a flat `{ status: 'ok' }` and the API
 * version. Intentionally cheap — does NOT touch the DB; integrators
 * that need readiness should use `/api/v1/readyz` (added later).
 */
export function GET(): Response {
  return Response.json({ status: 'ok', version: 'v1' });
}
