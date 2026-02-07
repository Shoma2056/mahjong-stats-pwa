import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "雀スタ",
        short_name: "雀スタ",
        description: "麻雀スタッツ管理アプリ",
        start_url: "/",
        display: "standalone",
        background_color: "#0b5d1e", // 麻雀っぽい緑
        theme_color: "#0b5d1e",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
});
