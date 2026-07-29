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
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("jspdf") || id.includes("html2canvas")) return "pdf-tools";
          if (id.includes("recharts") || id.includes("d3-")) return "charts";
          if (id.includes("xlsx")) return "spreadsheet-tools";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("react") || id.includes("scheduler")) return "react-vendor";
          return "vendor";
        },
      },
    },
  },
});
