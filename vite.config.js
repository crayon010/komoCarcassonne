import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  // 构建产物直接进 public/，由 server.js 原样托管，无需额外部署步骤
  build: { outDir: "public", emptyOutDir: true },
  // dev 模式下 WebSocket 与 /tiles 素材都转发给 server.js
  server: {
    proxy: {
      "/ws": { target: "ws://localhost:3000", ws: true },
      "/tiles": { target: "http://localhost:3000" },
    },
  },
});
