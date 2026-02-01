import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isDev = process.env.NODE_ENV !== "production";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    wasm(),
    topLevelAwait(),
    // Disable PWA in development to avoid caching issues
    !isDev && VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["fonts/**/*", "assets/**/*"],
      manifest: false, // Use public/manifest.json
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff,woff2,otf}"],
        // Exclude large ONNX runtime WASM from precaching (will be runtime cached)
        globIgnores: ["**/ort-*.wasm"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB for WASM
        runtimeCaching: [
          {
            // WASM modules - cache first (immutable)
            // Includes large ONNX runtime WASM files for AI inference
            urlPattern: /\.wasm$/,
            handler: "CacheFirst",
            options: {
              cacheName: "wasm-cache",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
          {
            // JS bundles - stale while revalidate
            urlPattern: /\.js$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "js-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          {
            // Fonts - cache first
            urlPattern: /\.(woff|woff2|otf|ttf)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "font-cache",
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
          {
            // Images/icons - cache first
            urlPattern: /\.(png|jpg|jpeg|svg|gif|webp)$/,
            handler: "CacheFirst",
            options: {
              cacheName: "image-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ["@vcad/kernel-wasm"],
  },
});
