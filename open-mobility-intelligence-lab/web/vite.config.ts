/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base './' keeps every asset URL relative, so the same build works on
// GitHub Pages project sites (/repo/), Cloudflare Pages (/) and local preview.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('maplibre-gl')) return 'maplibre'
          if (id.includes('deck.gl') || id.includes('luma.gl') || id.includes('math.gl') || id.includes('loaders.gl')) return 'deck'
          if (id.includes('echarts') || id.includes('zrender')) return 'echarts'
        },
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
