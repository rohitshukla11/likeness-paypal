import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Native addons, loaded with Node's require at runtime and never bundled.
  serverExternalPackages: ["@contentauth/c2pa-node", "sharp"],
};

export default nextConfig;
