import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Test the SDK source, not whatever was last built into packages/sdk/dist.
  resolve: { alias: { "@tabpaysi/sdk": fileURLToPath(new URL("./packages/sdk/src/index.ts", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts", "packages/sdk/test/**/*.test.ts", "packages/mcp/test/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
