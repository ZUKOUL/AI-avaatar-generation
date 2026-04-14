import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // 308 redirect horpen.com (and www.horpen.com) → horpen.ai, preserving path.
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "(www\\.)?horpen\\.com",
          },
        ],
        destination: "https://horpen.ai/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
