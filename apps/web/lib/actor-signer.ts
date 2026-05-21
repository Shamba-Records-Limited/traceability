import { eq } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { db } from './db';
import { decryptPrivateKey } from './wallet-crypto';

const { actors } = schema;

/**
 * Helper used anywhere the platform needs to act AS THE ACTOR (rather
 * than as the platform operator). The flow is:
 *
 *   1. Fetch the row's `encrypted_private_key`.
 *   2. Decrypt with `wallet-crypto.decryptPrivateKey`. Cleartext lives
 *      in process memory for the duration of the request and is
 *      never persisted.
 *   3. Forward the cleartext to the publisher via the appropriate
 *      "sign-as-actor" endpoint. (That endpoint does not yet exist
 *      on the publisher side; this helper is the web-side hook the
 *      future endpoint will plug into. See ADR-pending for the
 *      multi-signer publisher design.)
 *
 * This PR ships the helper without a corresponding publisher endpoint
 * because:
 *   a) Extending every publisher write to accept an alternate signer
 *      doubles the surface of this PR.
 *   b) The wallet onboarding flow lands first; once actors have
 *      keys-on-file, a follow-up PR can wire the publisher side
 *      against a real ADR.
 *
 * Today the only call site is `loadActorSigningMaterial`, which is
 * exercised by a "Test signature" debug action on the wallet page —
 * enough to prove the decrypt-and-forward path is wired correctly
 * end-to-end without binding the rest of the system to a half-built
 * publisher endpoint.
 */
export class ActorSignerError extends Error {
  readonly code: 'no-key' | 'decrypt-failed' | 'not-found';
  constructor(code: 'no-key' | 'decrypt-failed' | 'not-found', message: string) {
    super(message);
    this.code = code;
    this.name = 'ActorSignerError';
  }
}

export interface ActorSigningMaterial {
  actorId: string;
  hederaAccountId: string;
  /** Cleartext DER-encoded Hedera private key. Never persist. */
  privateKey: string;
}

/**
 * Load the actor's signing material from the DB. Returns the cleartext
 * private key alongside the account id. The cleartext MUST be passed
 * directly to the publisher and discarded; it must not be returned
 * to the client.
 */
export async function loadActorSigningMaterial(actorId: string): Promise<ActorSigningMaterial> {
  const rows = await db
    .select({
      id: actors.id,
      hederaAccountId: actors.hederaAccountId,
      encryptedPrivateKey: actors.encryptedPrivateKey,
    })
    .from(actors)
    .where(eq(actors.id, actorId))
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new ActorSignerError('not-found', `actor ${actorId} not found`);
  }
  if (!row.hederaAccountId || !row.encryptedPrivateKey) {
    throw new ActorSignerError(
      'no-key',
      `actor ${actorId} has no system-managed key; the wallet may be user-provided externally or not yet provisioned`,
    );
  }
  let privateKey: string;
  try {
    privateKey = decryptPrivateKey(row.encryptedPrivateKey);
  } catch (error) {
    throw new ActorSignerError(
      'decrypt-failed',
      `could not decrypt key for actor ${actorId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  return {
    actorId: row.id,
    hederaAccountId: row.hederaAccountId,
    privateKey,
  };
}

/**
 * Fingerprint a private key without exposing its contents. Used by the
 * "Test signature" debug action to confirm the round-trip without
 * leaking the cleartext into the response. Returns the SHA-256 hex of
 * the cleartext; cryptographically opaque from a confidentiality
 * standpoint and distinct per-key so the user can verify the right
 * key landed.
 */
export async function fingerprintPrivateKey(key: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(key, 'utf8').digest('hex');
}
