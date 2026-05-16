/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Next 16 promoted typedRoutes out of `experimental`. The flag stays on.
  typedRoutes: true,
  transpilePackages: ['@shamba/shared-types', '@shamba/db'],
};

export default nextConfig;
