import { NextResponse } from 'next/server';

import { runReconciler } from '../../../../lib/reconciler';

/**
 * Reconciliation cron endpoint. Fires both reconcilePlotEvents and
 * reconcileActorDids in sequence and returns a structured summary.
 *
 * Wired to Vercel Cron via `vercel.json`; local invocation works too:
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        http://localhost:3000/api/cron/reconcile
 *
 * Authentication is a shared bearer token. Vercel Cron sets the
 * `Authorization: Bearer <CRON_SECRET>` header on every cron invocation
 * automatically when the secret is configured on the deployment. Any
 * other caller (operator running a manual replay) must present the same
 * secret.
 *
 * Returns 401 when the secret is missing or mismatched, 503 when the
 * environment is unconfigured (no CRON_SECRET set at all — fail-closed
 * rather than fail-open), and 200 with the summary otherwise.
 */

// Force the Node.js runtime — Drizzle + postgres-js are Node-only, and the
// route does real database writes.
export const runtime = 'nodejs';

// This route is unbounded by the user's request budget; let Vercel know
// it may take longer than the default 10s.
export const maxDuration = 60;

function isAuthorized(request: Request): boolean | 'unconfigured' {
  const secret = process.env.CRON_SECRET;
  if (!secret) return 'unconfigured';
  const header = request.headers.get('authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) return false;
  const presented = header.slice('bearer '.length).trim();
  return presented.length > 0 && presented === secret;
}

async function handle(request: Request): Promise<NextResponse> {
  const authState = isAuthorized(request);
  if (authState === 'unconfigured') {
    return NextResponse.json(
      { ok: false, reason: 'CRON_SECRET not configured on this deployment' },
      { status: 503 },
    );
  }
  if (!authState) {
    return NextResponse.json({ ok: false, reason: 'invalid bearer token' }, { status: 401 });
  }

  try {
    const summary = await runReconciler();
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    console.error('[cron/reconcile] reconciler failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ ok: false, reason: 'reconciler_internal_error' }, { status: 500 });
  }
}

// Vercel Cron calls GET. Manual replays / curl can use either verb.
export const GET = handle;
export const POST = handle;
