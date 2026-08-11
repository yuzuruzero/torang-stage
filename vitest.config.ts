import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@torang/shared": path.resolve(__dirname, "packages/shared/src/index.ts"),
    },
  },
  test: {
    include: [
      "packages/*/test/**/*.test.ts",
      "apps/*/test/**/*.test.ts",
      "tools/**/*.test.ts",
    ],
    environment: "node",
    testTimeout: 15000,
  },
});
