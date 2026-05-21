import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Next 16 promoted typedRoutes out of `experimental`. The flag stays on.
  typedRoutes: true,
  transpilePackages: ['@shamba/shared-types', '@shamba/db'],
  // `postgres` uses Node-only modules (net, tls, fs, perf_hooks) that
  // Turbopack cannot resolve when it tries to bundle the package into
  // route handlers. Marking it as a server-external package keeps the
  // import as a runtime Node require() instead of being bundled.
  serverExternalPackages: ['postgres'],
  // `standalone` output produces a self-contained .next/standalone
  // directory with a `server.js` entrypoint. The Docker image copies
  // only that + .next/static + public, so the runtime image stays
  // small (no node_modules redistribution).
  output: 'standalone',
  // pnpm workspaces split dependencies across `apps/web/node_modules`,
  // `node_modules` at the monorepo root, and `node_modules/.pnpm`.
  // Pointing the tracer at the monorepo root makes sure the standalone
  // output picks up every workspace dep that web actually imports.
  outputFileTracingRoot: join(__dirname, '..', '..'),
};

export default nextConfig;
