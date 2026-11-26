import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Interface tests in jsdom; the core, the pipeline and repository checks in plain Node, so a DOM global used by
// mistake in src/core fails there as well as in the guard test (T-002).
export default defineConfig({
  plugins: [react()],
  test: {
    maxWorkers: "50%",
    testTimeout: 30_000,
    setupFiles: ["tests/setup-no-network.ts"],
    projects: [
      {
        extends: true,
        test: {
          name: "app",
          environment: "jsdom",
          include: ["src/app/**/*.test.ts", "src/app/**/*.test.tsx", "src/scene/**/*.test.tsx"],
        },
      },
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts", "tools/**/*.test.ts", "tests/**/*.test.ts"],
          exclude: ["src/app/**", "**/node_modules/**"],
        },
      },
    ],
  },
});
