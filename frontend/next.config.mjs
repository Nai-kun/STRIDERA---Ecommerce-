/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [],
    unoptimized: true  // allow local /assets images
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || '/api'
  },
  async rewrites() {
    const backendUrl = (process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:5000').replace(/\/+$/, '');
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
  allowedDevOrigins: ['169.254.141.178', 'localhost', '127.0.0.1', '192.168.1.73']
};

export default nextConfig;
