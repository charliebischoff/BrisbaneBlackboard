import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // We ship our own public/manifest.json (linked from index.html) rather
      // than letting the plugin generate one, so the two stay in sync.
      manifest: false,
      includeAssets: ['icon-192.png', 'icon-512.png'],
      workbox: {
        // webp matters: the two court images are webp, and without them the
        // board falls back to a blank white rectangle when offline.
        globPatterns: ['**/*.{js,css,html,png,svg,webp,json,woff2}'],
        runtimeCaching: [
          {
            // Belt-and-braces for the artwork the board can't be read without.
            urlPattern: ({ url }: { url: URL }) =>
              url.pathname.startsWith('/court/') || url.pathname.startsWith('/players/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'playbook-art',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: ({ url }: { url: URL }) =>
              url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'playbook-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
