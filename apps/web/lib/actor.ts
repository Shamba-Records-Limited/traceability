import { eq, sql } from 'drizzle-orm';

import { schema } from '@shamba/db';
import { actorRoleSchema, countryCodeSchema, type ActorRole } from '@shamba/shared-types';

import { db } from './db';
import { mintDid } from './did-issuer';

const { actors, users } = schema;

/**
 * Placeholder DID minted at actor creation. We insert the actor with a
 * placeholder so the `actors.did NOT NULL UNIQUE` constraint stays
 * satisfied even if the did-issuer service is unreachable. Immediately
 * after the create transaction commits, `createActorForUser` calls the
 * issuer and rotates the row to a real `did:hedera:<network>:<topicId>`.
 *
 * Placeholders that survive the rotation (issuer down at the time)
 * persist until manual intervention or a future reconciler PR.
 */
export const PLACEHOLDER_DID_PREFIX = 'did:placeholder:';

export function isPlaceholderDid(did: string): boolean {
  return did.startsWith(PLACEHOLDER_DID_PREFIX);
}

export interface ActorProfile {
  id: string;
  did: string;
  role: ActorRole;
  displayName: string;
  country: string;
  subnational: string | null;
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
    })
    .from(users)
    .innerJoin(actors, eq(actors.id, users.actorId))
    .where(eq(users.id, userId))
    .limit(1);

  return rows[0] ?? null;
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
 * Create the actor row for a freshly-onboarded user and link it to the Auth.js
 * user record in a single transaction. Throws OnboardingValidationError when
 * any input is malformed (callers should surface the issues to the form).
 *
 * After the create transaction commits, the did-issuer service is called
 * out-of-transaction to mint a real `did:hedera:<network>:<topicId>` for
 * the new actor; the placeholder DID is then rotated to the real value
 * via a small follow-up UPDATE. On issuer failure (network, timeout,
 * non-2xx, malformed body) the placeholder is left in place and a
 * background reconciler is expected to backfill — that reconciler is
 * future work; until it ships, placeholder rows stay placeholder.
 */
export async function createActorForUser(input: CreateActorInput): Promise<ActorProfile> {
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
      });

    if (!inserted) {
      throw new Error('actor insert returned no rows');
    }

    await tx.update(users).set({ actorId: inserted.id }).where(eq(users.id, input.userId));

    return inserted;
  });

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
        });
      if (rotated) {
        return rotated;
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

  return created;
}
