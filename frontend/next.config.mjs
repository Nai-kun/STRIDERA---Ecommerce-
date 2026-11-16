/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [],
    unoptimized: true  // allow local /assets images
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api'
  },
  allowedDevOrigins: ['169.254.141.178', 'localhost', '127.0.0.1']
};

export default nextConfig;
