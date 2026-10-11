import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev server proxies API + websocket calls to the Express backend on port 5000.
const target = "http://localhost:5000";
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": target,
      "/auth": target,
      "/health": target,
      "/socket.io": { target, ws: true },
    },
  },
});
