import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe slice of the Auth.js configuration.
 *
 * `middleware.ts` runs on Vercel's Edge runtime, which cannot load Node-only
 * modules such as `postgres` (the @shamba/db driver) or Nodemailer.
 * Splitting the config keeps middleware execution lightweight: it carries
 * only the page redirects and the `authorized` callback that decides which
 * routes are gated. The real provider list and the Drizzle adapter live in
 * `auth.ts` for Node-runtime route handlers; here `providers` is left
 * intentionally empty (the type requires the field to be present).
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
