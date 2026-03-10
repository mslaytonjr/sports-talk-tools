import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/nhl-api": {
        target: "https://api-web.nhle.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/nhl-api/, ""),
      },
    },
  },
});