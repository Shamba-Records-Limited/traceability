import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { schema } from '@shamba/db';
import NextAuth from 'next-auth';
import Nodemailer from 'next-auth/providers/nodemailer';

import { authConfig } from './auth.config';
import { db } from './lib/db';

/**
 * Single source of truth for the Auth.js client. The Drizzle adapter is
 * attached here (not in `auth.config.ts`) because `postgres` and the rest
 * of `@shamba/db` are Node-only and would refuse to load on the Edge
 * runtime.
 *
 * The Postgres connection lives in `lib/db.ts` and is shared with every
 * other server-side caller in the app, so a single pool serves Auth.js,
 * server actions, route handlers, and server components.
 */

// Treat empty-string env vars as unset. Templating tools (Vercel envs,
// docker-compose, .env loaders) commonly write `EMAIL_SERVER_HOST=` when a
// value is absent rather than omitting the key entirely; nullish-coalescing
// would let those empty strings through and Nodemailer would fail with an
// unhelpful "no host" error. `||` collapses both undefined and "" to the
// fallback.
const emailHost = process.env.EMAIL_SERVER_HOST || 'localhost';
const emailPortRaw = process.env.EMAIL_SERVER_PORT?.trim();
const emailPort = emailPortRaw ? Number.parseInt(emailPortRaw, 10) : 1025;
if (!Number.isFinite(emailPort) || emailPort <= 0 || emailPort > 65535) {
  throw new Error(
    `EMAIL_SERVER_PORT must be a TCP port between 1 and 65535, got ${process.env.EMAIL_SERVER_PORT!}`,
  );
}
const emailUser = process.env.EMAIL_SERVER_USER || undefined;
const emailPassword = process.env.EMAIL_SERVER_PASSWORD || undefined;
const emailFrom = process.env.EMAIL_FROM || 'no-reply@shamba.local';

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // Pass our schema tables explicitly. Without the second arg, the
  // Drizzle adapter falls back to internally-defined tables named
  // `user`, `account`, `session`, `verificationToken` (singular) —
  // which is NOT what the schema in `packages/db/src/schema/auth.ts`
  // creates (we use plural `users`, `accounts`, `sessions`,
  // `verificationTokens`). Without this binding the adapter issues
  // `SELECT * FROM "user"` at sign-in and crashes with
  // `relation "user" does not exist`.
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  // JWT (JWE) session strategy: the session cookie is a self-contained
  // encrypted token, so the Edge-runtime middleware in `proxy.ts` can
  // decode it without needing database access.
  //
  // The alternative ('database') keeps a session row in Postgres and
  // stores only a token id in the cookie. That works with `auth.ts`
  // (Node runtime, has the DB adapter) but breaks `proxy.ts` (Edge
  // runtime, has only the Edge-safe `authConfig`): proxy tries to
  // decode the cookie as a JWE, gets a random UUID, throws
  // `JWTSessionError: Invalid Compact JWE`, and every request to a
  // protected route bounces straight back to /sign-in.
  //
  // We still use the Drizzle adapter — it owns users/accounts/
  // verificationTokens. Only the `sessions` table goes unused under
  // this strategy, which is fine.
  //
  // https://authjs.dev/concepts/session-strategies
  session: { strategy: 'jwt' },
  providers: [
    Nodemailer({
      server: {
        host: emailHost,
        port: emailPort,
        auth: emailUser && emailPassword ? { user: emailUser, pass: emailPassword } : undefined,
      },
      from: emailFrom,
    }),
  ],
});
