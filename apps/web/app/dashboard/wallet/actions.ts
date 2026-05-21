'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { schema } from '@shamba/db';

import { auth } from '../../../auth';
import { db } from '../../../lib/db';
import { getActorForUser } from '../../../lib/actor';
import {
  ActorSignerError,
  fingerprintPrivateKey,
  loadActorSigningMaterial,
} from '../../../lib/actor-signer';
import { encryptPrivateKey } from '../../../lib/wallet-crypto';

const { actors } = schema;

export type WalletState =
  | { status: 'idle' }
  | { status: 'unauthenticated' }
  | { status: 'no-actor' }
  | { status: 'error'; message: string }
  | { status: 'ok'; accountId: string };

// Hedera account id shape: `0.0.<num>`. Realm/shard are 0 today on
// every supported network; accepting the canonical form keeps us
// strict without rejecting any legitimate id.
const HEDERA_ACCOUNT_ID_RE = /^0\.0\.\d{1,15}$/;

// DER-encoded Hedera private key shape. The Hedera SDK emits DER as a
// hex string; the OID prefix `302e020100300506032b657004220420` is for
// Ed25519 and `3030020100300706052b8104000a042204` for ECDSA secp256k1.
// We accept either by matching the broader prefix shape — exact OID
// matching is delegated to the publisher when it actually tries to load
// the key. This guard only catches typos / paste errors.
const HEDERA_PRIVATE_KEY_RE = /^[0-9a-fA-F]{96,256}$/;

/**
 * Replace the actor's wallet with a user-provided keypair. The
 * cleartext key is encrypted with `encryptPrivateKey` before it
 * touches the DB; the previous wallet's encrypted key (if any) is
 * overwritten and cannot be recovered.
 *
 * Ownership validation is best-effort right now: we shape-check both
 * fields and trust that a correctly-shaped, parseable private key
 * controls the supplied account. A follow-up PR will add a
 * `POST /v1/accounts/verify` to the publisher that submits a tiny
 * signed transaction (zero-HBAR self-transfer) against the supplied
 * account to prove control; until then the trust model is "the
 * actor doesn't lie to themselves".
 */
export async function replaceWallet(_prev: WalletState, formData: FormData): Promise<WalletState> {
  const session = await auth();
  if (!session?.user?.id) return { status: 'unauthenticated' };
  const actor = await getActorForUser(session.user.id);
  if (!actor) return { status: 'no-actor' };

  const accountId = String(formData.get('hederaAccountId') ?? '').trim();
  const privateKey = String(formData.get('privateKey') ?? '').trim();

  if (!HEDERA_ACCOUNT_ID_RE.test(accountId)) {
    return {
      status: 'error',
      message: 'Account id must be in the canonical Hedera form `0.0.<num>` (e.g. 0.0.12345).',
    };
  }
  if (!HEDERA_PRIVATE_KEY_RE.test(privateKey)) {
    return {
      status: 'error',
      message:
        'Private key must be the DER-hex form emitted by Hedera tooling (96–256 hex characters, no 0x prefix).',
    };
  }

  let encrypted: string;
  try {
    encrypted = encryptPrivateKey(privateKey);
  } catch (error) {
    console.error('[wallet] encrypt failed', {
      actorId: actor.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      status: 'error',
      message:
        'Could not encrypt the supplied key. The server is misconfigured (missing AUTH_SECRET); contact an admin.',
    };
  }

  try {
    await db
      .update(actors)
      .set({
        hederaAccountId: accountId,
        encryptedPrivateKey: encrypted,
        walletProvider: 'user_provided',
        updatedAt: new Date(),
      })
      .where(eq(actors.id, actor.id));
  } catch (error) {
    // Most likely cause: the UNIQUE constraint on hedera_account_id
    // rejected the value because another actor is already using it.
    // We don't surface the raw PG error to the user; instead translate
    // to a generic "already in use".
    console.warn('[wallet] update failed', {
      actorId: actor.id,
      accountId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      status: 'error',
      message:
        'Could not save this wallet. The account id may already be linked to another actor; try a different one.',
    };
  }

  revalidatePath('/dashboard/wallet');
  revalidatePath('/dashboard');
  return { status: 'ok', accountId };
}

export type TestSignatureState =
  | { status: 'idle' }
  | { status: 'unauthenticated' }
  | { status: 'no-actor' }
  | { status: 'no-key' }
  | { status: 'error'; message: string }
  | { status: 'ok'; accountId: string; keyFingerprint: string };

/**
 * Demonstrate the encrypted-at-rest -> in-memory-cleartext round trip
 * for the actor's wallet. This is the proof-of-end-to-end pattern
 * that future publisher endpoints will follow: load the encrypted
 * key, decrypt in-process, hand the cleartext to the publisher.
 *
 * Today there is no publisher endpoint that accepts an actor-signed
 * payload, so the action stops at decrypt + fingerprint and surfaces
 * the SHA-256 of the cleartext to the user. The fingerprint is enough
 * to confirm the right key was retrieved without leaking the key
 * itself; future PRs will replace this body with a real publisher
 * call.
 */
export async function testActorSignature(
  _prev: TestSignatureState,
  _formData: FormData,
): Promise<TestSignatureState> {
  const session = await auth();
  if (!session?.user?.id) return { status: 'unauthenticated' };
  const actor = await getActorForUser(session.user.id);
  if (!actor) return { status: 'no-actor' };

  try {
    const material = await loadActorSigningMaterial(actor.id);
    const fingerprint = await fingerprintPrivateKey(material.privateKey);
    return {
      status: 'ok',
      accountId: material.hederaAccountId,
      keyFingerprint: fingerprint,
    };
  } catch (error) {
    if (error instanceof ActorSignerError) {
      if (error.code === 'no-key') return { status: 'no-key' };
      return { status: 'error', message: error.message };
    }
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'unknown error',
    };
  }
}
