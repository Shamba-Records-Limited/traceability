// Auth.js v5 catch-all route handler. The handlers object is constructed in
// `auth.ts`; we re-export its GET and POST methods so Next.js's App Router
// picks them up at /api/auth/*.
import { handlers } from '../../../../auth';

export const { GET, POST } = handlers;
