import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default ({ mode }: { mode: string }) => {
  const env = loadEnv(mode, ".");

  return defineConfig({
    server: {
      port: 3000,
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
