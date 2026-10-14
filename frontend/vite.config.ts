import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The dev server proxies /api to the local FastAPI backend so the SPA is
// effectively same-origin (no CORS) during development. In production the
// backend serves the built SPA directly.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8765", changeOrigin: true },
    },
  },
});
