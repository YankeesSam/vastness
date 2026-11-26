import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// VN-GEN-001: a static build. `base` becomes /vastness/ for GitHub Pages in T-007.
export default defineConfig({
  base: "./",
  plugins: [react()],
  worker: { format: "es" },
});
