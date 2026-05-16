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

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db),
  session: { strategy: 'database' },
  providers: [
    Nodemailer({
      server: {
        host: process.env.EMAIL_SERVER_HOST ?? 'localhost',
        port: Number(process.env.EMAIL_SERVER_PORT ?? 1025),
        auth:
          process.env.EMAIL_SERVER_USER && process.env.EMAIL_SERVER_PASSWORD
            ? {
                user: process.env.EMAIL_SERVER_USER,
                pass: process.env.EMAIL_SERVER_PASSWORD,
              }
            : undefined,
      },
      from: process.env.EMAIL_FROM ?? 'no-reply@shamba.local',
    }),
  ],
});
