import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev only: pretend to be the signed-in admin so /api/manage/* works without the SWA emulator.
// In Azure, Static Web Apps sets this header itself after a real GitHub login.
const devPrincipal = Buffer.from(
  JSON.stringify({
    identityProvider: "github",
    userId: "dev",
    userDetails: "Haval-Jalal (dev)",
    userRoles: ["anonymous", "authenticated", "admin"],
  }),
).toString("base64");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Proxy the .NET Functions API during local development.
    proxy: {
      "/api": {
        target: "http://localhost:7071",
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            if (req.url?.startsWith("/api/manage/") || req.url?.startsWith("/api/auth/")) proxyReq.setHeader("x-ms-client-principal", devPrincipal);
          });
        },
      },
    },
  },
});
