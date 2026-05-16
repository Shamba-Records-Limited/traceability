import { eq, sql } from 'drizzle-orm';

import { schema } from '@shamba/db';
import { actorRoleSchema, countryCodeSchema, type ActorRole } from '@shamba/shared-types';

import { db } from './db';

const { actors, users } = schema;

/**
 * Placeholder DID minted at actor creation. The did-issuer service lands in
 * a follow-up PR; until then every actor gets a `did:placeholder:<uuid>`
 * value so the `actors.did` NOT NULL UNIQUE constraint stays satisfied.
 *
 * The did-issuer service iterates rows where `did` matches the placeholder
 * format and replaces them with a real `did:hedera:...` once the HCS
 * anchoring transaction lands.
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
 * The `did` column is filled with a placeholder; the did-issuer service
 * rotates it to a real `did:hedera:...` value when it runs.
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

  return db.transaction(async (tx) => {
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
}
