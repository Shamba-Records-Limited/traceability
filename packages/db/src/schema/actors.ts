import { sql } from 'drizzle-orm';
import { char, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { actorRoleEnum } from './enums';

/**
 * Single table for every actor regardless of role. Role-specific fields live
 * in the discriminated `roleAttrs` JSONB column to avoid sparse nullable
 * columns; the structure of that JSON is enforced at the application layer
 * by the Zod schemas in `@shamba/shared-types/actor`.
 *
 * `did` is unique because every actor maps 1:1 to a Hedera DID at issuance;
 * this is the foreign key the rest of the schema joins against where it
 * matters that the entity is on-chain-identified.
 */
export const actors = pgTable(
  'actors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    did: text('did').notNull().unique(),
    role: actorRoleEnum('role').notNull(),
    displayName: text('display_name').notNull(),
    country: char('country', { length: 2 }).notNull(),
    subnational: text('subnational'),
    contactEmail: text('contact_email'),
    contactPhone: text('contact_phone'),
    roleAttrs: jsonb('role_attrs')
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('actors_role_idx').on(t.role), index('actors_country_idx').on(t.country)],
);

/**
 * Convenience export for joins; the Zod schema in shared-types/actor.ts is
 * authoritative for runtime validation, this is just the inferred type.
 */
export type ActorRow = typeof actors.$inferSelect;
export type NewActorRow = typeof actors.$inferInsert;
