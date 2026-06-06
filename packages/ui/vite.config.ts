import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: process.env.PARALLAX_NETWORK_ACCESS === "true" ? "0.0.0.0" : "127.0.0.1",
    allowedHosts: process.env.PARALLAX_NETWORK_ACCESS === "true" ? true : undefined,
    port: 9372,
  },
  plugins: [
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@parallax/common": path.resolve(__dirname, "../common/src/index.ts"),
    },
  },
}));
