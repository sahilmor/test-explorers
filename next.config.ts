import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Pin the workspace root so Turbopack does not walk up into the home
    // directory looking for a lockfile.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
