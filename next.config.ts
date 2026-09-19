import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets the in-app browser preview load dev assets when it visits the app
  // over 127.0.0.1 rather than localhost. Development only.
  allowedDevOrigins: ["127.0.0.1"],
  turbopack: {
    // Pin the workspace root so Turbopack does not walk up into the home
    // directory looking for a lockfile.
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
