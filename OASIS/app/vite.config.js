import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@core": path.resolve(__dirname, "../core"),
    },
  },
  optimizeDeps: {
    include: ["@core/telemetry/index.js"],
  },
  build: {
    commonjsOptions: {
      include: [/core\//, /node_modules\//],
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:7071",
    },
  },
});
