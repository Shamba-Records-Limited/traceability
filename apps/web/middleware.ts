import NextAuth from 'next-auth';

import { authConfig } from './auth.config';

// Middleware runs on the Edge runtime; only the Edge-safe slice of the
// Auth.js config is imported here. The full config (with Nodemailer + the
// Drizzle adapter) lives in `./auth.ts` for Node-runtime route handlers.
export const { auth: middleware } = NextAuth(authConfig);

export default middleware;

export const config = {
  // Run on every request EXCEPT static assets, image optimisation, and the
  // Auth.js API routes themselves (those handle their own auth state).
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
