import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts", "agents/**/*.test.ts"],
    environment: "node",
  },
});
