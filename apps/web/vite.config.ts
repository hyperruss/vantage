import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
  const env = loadEnv(mode, projectRoot, "APP_PORT");
  const apiPort = env.APP_PORT || "3000";

  return {
    plugins: [react()],
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: { "/api": `http://127.0.0.1:${apiPort}` },
    },
  };
});
