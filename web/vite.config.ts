/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
