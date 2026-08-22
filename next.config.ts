import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  allowedDevOrigins: [
    "*.run.app",
    "ais-dev-af25rey5a3wy6l7dakb5ar-411517047331.asia-southeast1.run.app",
    "ais-pre-af25rey5a3wy6l7dakb5ar-411517047331.asia-southeast1.run.app",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,DELETE,PATCH,POST,PUT,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, ngrok-skip-browser-warning" },
        ],
      },
    ];
  },
};

export default nextConfig;
