import { DrizzleAdapter } from '@auth/drizzle-adapter';
import NextAuth from 'next-auth';
import Nodemailer from 'next-auth/providers/nodemailer';

import { createClient } from '@shamba/db';

import { authConfig } from './auth.config';

/**
 * Single source of truth for the Auth.js client. The Drizzle adapter is
 * attached here (not in `auth.config.ts`) because `postgres` and the rest
 * of `@shamba/db` are Node-only and would refuse to load on the Edge
 * runtime.
 *
 * The createClient factory also returns a `close()` function. We
 * intentionally do NOT call it here: the Auth.js handler instance is
 * long-lived and shares a single connection pool with the rest of the
 * Node-runtime route handlers in this app. Process exit cleans up
 * the underlying TCP socket.
 */
const { db } = createClient();

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
  adapter: DrizzleAdapter(db),
  session: { strategy: 'database' },
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
