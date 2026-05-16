import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe slice of the Auth.js configuration.
 *
 * `middleware.ts` runs on Vercel's Edge runtime, which cannot load Node-only
 * modules such as `postgres` (the @shamba/db driver). Splitting the config
 * keeps middleware execution lightweight: it only needs the providers list
 * (for callback URL validation) and the auth callback that decides which
 * routes are protected. The full configuration in `auth.ts` adds the
 * Drizzle adapter and Nodemailer provider, which are Node-only.
 *
 * See: https://authjs.dev/getting-started/migrating-to-v5#edge-compatibility
 */
export const authConfig = {
  pages: {
    signIn: '/sign-in',
    verifyRequest: '/sign-in/check-email',
    error: '/sign-in',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isAuthed = !!auth?.user;
      const onProtectedRoute = nextUrl.pathname.startsWith('/dashboard');
      if (onProtectedRoute) {
        return isAuthed;
      }
      // Other routes (landing, sign-in, public QR pages) are always allowed.
      return true;
    },
  },
  // Providers are listed in `auth.ts` because Nodemailer is Node-only.
  // The Auth.js types require at least an empty array here.
  providers: [],
} satisfies NextAuthConfig;
