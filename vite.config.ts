import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function buildCommit(): string {
  const fromEnvironment = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || process.env.COMMIT_SHA;
  if (fromEnvironment) return fromEnvironment;
  try { return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); }
  catch { return "local"; }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __PRAXIS_BUILD_COMMIT__: JSON.stringify(buildCommit()),
    __PRAXIS_BUILD_DATE__: JSON.stringify(process.env.CF_PAGES_COMMIT_TIMESTAMP || new Date().toISOString()),
  },
});
