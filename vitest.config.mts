import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // The harness boots a real MongoDB replica set and a real Next server.
    testTimeout: 60_000,
    hookTimeout: 180_000,
    // One server, one database — running files in parallel would fight over them.
    fileParallelism: false,
  },
});
