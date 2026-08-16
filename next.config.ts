import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    // Linting is a separate, explicit gate: `npm run lint`.
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Type errors still fail `npm run typecheck` and `npm run build`.
    ignoreBuildErrors: false,
  },
  experimental: {
    // bcryptjs + sanitize-html are CJS and must stay on the server side.
    serverActions: {
      bodySizeLimit: '4mb',
    },
  },
};

export default nextConfig;
