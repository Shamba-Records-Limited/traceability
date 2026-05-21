import { eq, sql } from 'drizzle-orm';

import { schema } from '@shamba/db';
import { actorRoleSchema, countryCodeSchema, type ActorRole } from '@shamba/shared-types';

import { db } from './db';
import { mintDid } from './did-issuer';
import { createHederaAccount } from './hedera-account';
import { encryptPrivateKey } from './wallet-crypto';

const { actors, users } = schema;

/**
 * Placeholder DID minted at actor creation. We insert the actor with a
 * placeholder so the `actors.did NOT NULL UNIQUE` constraint stays
 * satisfied even if the did-issuer service is unreachable. Immediately
 * after the create transaction commits, `createActorForUser` calls the
 * issuer and rotates the row to a real `did:hedera:<network>:<topicId>`.
 *
 * Placeholders that survive the rotation (issuer down at the time) are
 * picked up by `reconcileActorDids` in `lib/reconciler.ts` on the cron
 * schedule and retried until the rotation lands.
 */
export const PLACEHOLDER_DID_PREFIX = 'did:placeholder:';

export function isPlaceholderDid(did: string): boolean {
  return did.startsWith(PLACEHOLDER_DID_PREFIX);
}

/**
 * Provenance of the wallet attached to an actor. See
 * `packages/db/src/schema/actors.ts` for the canonical comment.
 */
export type WalletProvider = 'system_generated' | 'user_provided';

export interface ActorProfile {
  id: string;
  did: string;
  role: ActorRole;
  displayName: string;
  country: string;
  subnational: string | null;
  hederaAccountId: string | null;
  walletProvider: WalletProvider | null;
}

/**
 * Fetch the actor profile linked to a given Auth.js user, if any. Returns
 * null when the user has not yet completed onboarding.
 */
export async function getActorForUser(userId: string): Promise<ActorProfile | null> {
  const rows = await db
    .select({
      id: actors.id,
      did: actors.did,
      role: actors.role,
      displayName: actors.displayName,
      country: actors.country,
      subnational: actors.subnational,
      hederaAccountId: actors.hederaAccountId,
      walletProvider: actors.walletProvider,
    })
    .from(users)
    .innerJoin(actors, eq(actors.id, users.actorId))
    .where(eq(users.id, userId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    walletProvider: normaliseWalletProvider(row.walletProvider),
  };
}

function normaliseWalletProvider(value: string | null): WalletProvider | null {
  if (value === 'system_generated' || value === 'user_provided') return value;
  return null;
}

export interface CreateActorInput {
  userId: string;
  role: ActorRole;
  displayName: string;
  country: string;
  subnational?: string;
}

export class OnboardingValidationError extends Error {
  readonly issues: ReadonlyArray<{ path: string; message: string }>;

  constructor(issues: ReadonlyArray<{ path: string; message: string }>) {
    super('onboarding input failed validation');
    this.issues = issues;
    this.name = 'OnboardingValidationError';
  }
}

/**
 * Result of `createActorForUser`: the new actor row plus, when the
 * publisher-side wallet provisioning succeeded, the CLEARTEXT private
 * key. The caller (`onboarding/actions.ts`) is responsible for
 * forwarding the cleartext into the one-time download cookie and
 * NEVER persisting it anywhere outside the encrypted column.
 */
export interface CreateActorResult {
  actor: ActorProfile;
  walletCleartext: WalletCleartext | null;
}

/**
 * Cleartext wallet material returned from `createActorForUser` on
 * successful publisher provisioning. Lives in memory for the duration
 * of the request and is then handed to the one-time-download flow.
 */
export interface WalletCleartext {
  accountId: string;
  publicKey: string;
  privateKey: string;
  evmAddress: string;
  createTransactionId: string;
  initialBalanceTinybars: number;
  createdAt: string;
}

/**
 * Create the actor row for a freshly-onboarded user and link it to the Auth.js
 * user record in a single transaction. Throws OnboardingValidationError when
 * any input is malformed (callers should surface the issues to the form).
 *
 * After the create transaction commits, the did-issuer service is called
 * out-of-transaction to mint a real `did:hedera:<network>:<topicId>` for
 * the new actor; the placeholder DID is then rotated to the real value
 * via a small follow-up UPDATE. On issuer failure (network, timeout,
 * non-2xx, malformed body) the placeholder is left in place and the
 * reconciler in `lib/reconciler.ts` (Vercel Cron, 5-minute cadence)
 * sweeps placeholder rows and retries the mint.
 *
 * The publisher's `/v1/accounts/create` endpoint is also called
 * out-of-transaction to provision a Hedera wallet. The returned
 * private key is encrypted with `wallet-crypto.encryptPrivateKey`
 * before the UPDATE; the cleartext is propagated back to the caller
 * as `walletCleartext` (the onboarding flow stashes it in a
 * one-time-use cookie for the download screen). On publisher
 * failure, the actor row is left without a wallet and the dashboard
 * surfaces a "wallet pending" badge; a follow-up flow can re-attempt
 * provisioning without re-running the whole onboarding.
 */
export async function createActorForUser(input: CreateActorInput): Promise<CreateActorResult> {
  const issues: { path: string; message: string }[] = [];

  const roleResult = actorRoleSchema.safeParse(input.role);
  if (!roleResult.success) {
    issues.push({ path: 'role', message: 'select a valid role' });
  } else if (roleResult.data === 'farmer' || roleResult.data === 'competent_authority') {
    // Farmers do not self-onboard in the MVP; competent authorities are
    // provisioned by Shamba operators rather than self-service signup.
    issues.push({
      path: 'role',
      message: 'this role cannot self-onboard yet',
    });
  }

  const countryResult = countryCodeSchema.safeParse(input.country.toUpperCase());
  if (!countryResult.success) {
    issues.push({ path: 'country', message: 'enter an ISO 3166-1 alpha-2 country code' });
  }

  const trimmedName = input.displayName.trim();
  if (trimmedName.length < 2 || trimmedName.length > 200) {
    issues.push({ path: 'displayName', message: 'display name must be 2 to 200 characters' });
  }

  if (issues.length > 0) {
    throw new OnboardingValidationError(issues);
  }

  const created = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(actors)
      .values({
        did: sql`${PLACEHOLDER_DID_PREFIX} || gen_random_uuid()::text`,
        role: roleResult.data!,
        displayName: trimmedName,
        country: countryResult.data!,
        subnational: input.subnational?.trim() || null,
      })
      .returning({
        id: actors.id,
        did: actors.did,
        role: actors.role,
        displayName: actors.displayName,
        country: actors.country,
        subnational: actors.subnational,
        hederaAccountId: actors.hederaAccountId,
        walletProvider: actors.walletProvider,
      });

    if (!inserted) {
      throw new Error('actor insert returned no rows');
    }

    await tx.update(users).set({ actorId: inserted.id }).where(eq(users.id, input.userId));

    return inserted;
  });

  let actor: ActorProfile = {
    ...created,
    walletProvider: normaliseWalletProvider(created.walletProvider),
  };

  // Post-commit DID mint. Same shape as the publisher integration in
  // lib/plot.ts: run outside the transaction so a slow or unreachable
  // issuer does not hold a database connection, and tolerate failure by
  // leaving the placeholder DID in place. On success we rotate the row
  // to the real DID with a single UPDATE; on backfill failure we keep
  // the placeholder and log loudly (the on-chain mint already landed).
  const mint = await mintDid({
    actorId: created.id,
    displayName: created.displayName,
  });
  if (mint) {
    try {
      const [rotated] = await db
        .update(actors)
        .set({ did: mint.did, updatedAt: new Date() })
        .where(eq(actors.id, created.id))
        .returning({
          id: actors.id,
          did: actors.did,
          role: actors.role,
          displayName: actors.displayName,
          country: actors.country,
          subnational: actors.subnational,
          hederaAccountId: actors.hederaAccountId,
          walletProvider: actors.walletProvider,
        });
      if (rotated) {
        actor = {
          ...rotated,
          walletProvider: normaliseWalletProvider(rotated.walletProvider),
        };
      } else {
        // The HCS mint landed but the UPDATE matched no rows. The on-chain
        // DID exists but the DB still carries the placeholder; same
        // operational concern as the catch-branch below.
        console.error('[actor] DID mint succeeded but rotation UPDATE returned no rows', {
          actorId: created.id,
          did: mint.did,
          topicId: mint.topicId,
        });
      }
    } catch (error) {
      // The HCS mint landed but the rotation UPDATE failed. The placeholder
      // DID survives on the row; future page loads will still show
      // "Placeholder identifier" until manual intervention or the
      // reconciler runs. Log loudly so this surfaces in production traces.
      console.error('[actor] DID mint succeeded but placeholder rotation failed', {
        actorId: created.id,
        did: mint.did,
        topicId: mint.topicId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Post-commit wallet provisioning. Run AFTER the DID mint so the actor
  // row already has its real DID by the time the wallet lands (purely
  // ordering preference; the two flows are independent). Soft failure:
  // a missing wallet does not block onboarding; the dashboard surfaces
  // a pending-state badge. The cleartext private key is returned to
  // the caller, never persisted; the encrypted form goes to the DB.
  let walletCleartext: WalletCleartext | null = null;
  const wallet = await createHederaAccount({
    label: `shamba:${actor.id}`,
  });
  if (wallet) {
    try {
      const encrypted = encryptPrivateKey(wallet.privateKey);
      const [updated] = await db
        .update(actors)
        .set({
          hederaAccountId: wallet.accountId,
          encryptedPrivateKey: encrypted,
          walletProvider: 'system_generated',
          updatedAt: new Date(),
        })
        .where(eq(actors.id, actor.id))
        .returning({
          id: actors.id,
          did: actors.did,
          role: actors.role,
          displayName: actors.displayName,
          country: actors.country,
          subnational: actors.subnational,
          hederaAccountId: actors.hederaAccountId,
          walletProvider: actors.walletProvider,
        });
      if (updated) {
        actor = {
          ...updated,
          walletProvider: normaliseWalletProvider(updated.walletProvider),
        };
        walletCleartext = {
          accountId: wallet.accountId,
          publicKey: wallet.publicKey,
          privateKey: wallet.privateKey,
          evmAddress: wallet.evmAddress,
          createTransactionId: wallet.createTransactionId,
          initialBalanceTinybars: wallet.initialBalance,
          createdAt: new Date().toISOString(),
        };
      } else {
        // Wallet was created on-chain but the actor row update returned
        // no rows (e.g. the actor was deleted mid-flight). The HBAR is
        // spent and we can no longer associate the key with any user;
        // log loudly so this is observable.
        console.error('[actor] wallet created but actor UPDATE returned no rows', {
          actorId: actor.id,
          accountId: wallet.accountId,
          createTxId: wallet.createTransactionId,
        });
      }
    } catch (error) {
      // Wallet was created on-chain but we couldn't encrypt or persist
      // it. The HBAR is spent; the cleartext is lost. This is a known
      // edge case worth alerting on but not worth crashing onboarding
      // for — the user can replace the (now-orphan) wallet via the
      // dashboard if they ever need on-chain custody.
      console.error('[actor] wallet created but encrypt/store failed', {
        actorId: actor.id,
        accountId: wallet.accountId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { actor, walletCleartext };
}
