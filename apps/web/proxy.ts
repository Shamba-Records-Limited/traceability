import NextAuth from 'next-auth';

import { authConfig } from './auth.config';

// Next 16 renamed the `middleware` file convention to `proxy`. The runtime
// behaviour is identical — runs on the Edge runtime, executes before any
// route handler, gates requests based on the auth callback in
// `auth.config.ts`. Only the Edge-safe slice of the Auth.js config is
// imported here; the full Node-runtime config (Nodemailer, Drizzle
// adapter) stays in `./auth.ts`.
export const { auth: proxy } = NextAuth(authConfig);

export default proxy;

export const config = {
  // Run on every request EXCEPT static assets, image optimisation, and the
  // Auth.js API routes themselves (those handle their own auth state).
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico).*)'],
};
