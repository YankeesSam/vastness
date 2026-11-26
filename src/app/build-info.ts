// VN-GEN-006: version and commit, injected at build time by vite.config.ts from the same git commands as
// scripts/nightly-build.sh (and written next to the app as build.json).

export interface BuildInfo {
  name: string;
  version: string;
  commit: string;
  commit_time: string;
}

declare const __VASTNESS_BUILD__: BuildInfo | undefined;

export const buildInfo: BuildInfo =
  typeof __VASTNESS_BUILD__ === "undefined"
    ? { name: "vastness", version: "dev", commit: "unknown", commit_time: "unknown" }
    : __VASTNESS_BUILD__;
