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
};

export default nextConfig;
