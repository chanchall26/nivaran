/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: 'Barahmasa · Gwalior',
        short_name: 'Barahmasa',
        description: 'Shade in summer, warmth in winter: thermal safety for people who work outside.',
        lang: 'hi',
        start_url: '/',
        display: 'standalone',
        background_color: '#fff6ea',
        theme_color: '#e4571e',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Report', url: '/report', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
          { name: 'Map', url: '/map', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        // app shell + Gwalior data; big ML assets are cached on first use instead
        globPatterns: ['**/*.{js,css,html,svg,png,json}'],
        globIgnores: ['**/mediapipe/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://tiles.openfreemap.org',
            handler: 'CacheFirst',
            options: { cacheName: 'map-tiles', expiration: { maxEntries: 1500, maxAgeSeconds: 30 * 86400 } },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 30, maxAgeSeconds: 365 * 86400 } },
          },
          {
            urlPattern: ({ url }) => url.hostname.endsWith('open-meteo.com'),
            handler: 'NetworkFirst',
            options: { cacheName: 'weather', networkTimeoutSeconds: 6, expiration: { maxEntries: 20, maxAgeSeconds: 2 * 86400 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/mediapipe/') || url.pathname.startsWith('/models/'),
            handler: 'CacheFirst',
            options: { cacheName: 'ml-models', expiration: { maxEntries: 20 } },
          },
        ],
      },
    }),
  ],
  // MapLibre v6 loads its worker via a URL relative to its own module; pre-bundling breaks that
  optimizeDeps: { exclude: ['maplibre-gl'] },
  build: {
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('@deck.gl') || id.includes('@luma.gl') || id.includes('maplibre')) return 'map'
          if (id.includes('firebase')) return 'firebase'
          if (id.includes('jspdf')) return 'pdf'
        },
      },
    },
  },
  test: { environment: 'node' },
})
