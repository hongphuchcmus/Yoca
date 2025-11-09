import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default ({ mode }: { mode: string }) => {
  const env = loadEnv(mode, "..", "CLIENT_");

  return defineConfig({
    envDir: "..",
    envPrefix: "CLIENT_",
    server: {
      port: 3000,
      proxy: {
        "/api": {
          target: env.CLIENT_API_DOMAIN,
        },
      },
      allowedHosts: true,
      watch: {
        ignored: ["build/**"],
      },
    },
    plugins: [react()],
    build: {
      outDir: "build",
    },
  });
};
