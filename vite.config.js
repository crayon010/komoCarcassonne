import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import fs from "node:fs";

// 构建后把产物 js/css 全部内联进 index.html：单文件，file:// 双击即可运行
// （外部 module 脚本在 file:// 下被 CORS 拦截，内联脚本无此限制；单 chunk 无 import，可安全内联）
function inlineAssets() {
  return {
    name: "inline-assets",
    closeBundle() {
      const htmlFile = "public/index.html";
      let html = fs.readFileSync(htmlFile, "utf8");
      html = html.replace(
        /<script type="module"[^>]*src="\/assets\/([^"]+)"><\/script>/,
        (_, f) =>
          `<script type="module">\n${fs.readFileSync(`public/assets/${f}`, "utf8")}\n</script>`,
      );
      html = html.replace(
        /<link rel="stylesheet"[^>]*href="\/assets\/([^"]+)">/,
        (_, f) => `<style>\n${fs.readFileSync(`public/assets/${f}`, "utf8")}\n</style>`,
      );
      fs.writeFileSync(htmlFile, html);
      fs.rmSync("public/assets", { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  plugins: [vue(), inlineAssets()],
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
