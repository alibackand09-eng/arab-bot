/** @type {import('next').NextConfig} */
const path = require('path');
const fs = require('fs');

// Asosiy ildiz .env faylidan PORT ni dinamik aniqlash
let backendPort = process.env.BACKEND_PORT || process.env.PORT || '5001';
try {
  const rootEnvPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(rootEnvPath)) {
    const envContent = fs.readFileSync(rootEnvPath, 'utf8');
    const portMatch = envContent.match(/^\s*PORT\s*=\s*(\d+)/m);
    if (portMatch) {
      backendPort = portMatch[1];
    }
  }
} catch (e) {}

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `http://localhost:${backendPort}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
