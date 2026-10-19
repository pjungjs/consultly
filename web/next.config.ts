import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Deployed: the browser calls /api/* on this site and it's forwarded to the API, so the API's sign-in cookie
  // belongs to this site (free hosts give the web app and API unrelated addresses). Not used locally.
  async rewrites() {
    const api = process.env.API_INTERNAL_URL;
    return api ? [{ source: "/api/:path*", destination: `${api.replace(/\/$/, "")}/:path*` }] : [];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
