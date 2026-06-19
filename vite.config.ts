import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Project Pages site lives at https://fjacquet.github.io/ppdm-report/, so the
  // default build base is the subpath. VITE_BASE overrides it (e.g. '/' for
  // container/root deploys); dev/preview honour the override too.
  base: process.env.VITE_BASE || '/ppdm-report/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      // The PwaUpdater component registers via useRegisterSW; don't auto-inject too.
      injectRegister: false,
      // pwa-assets.config.ts → all icon sizes (192/512/maskable/apple-touch/
      // favicon), injected into the manifest + index.html head.
      pwaAssets: { config: true },
      manifest: {
        name: 'PPDM Report',
        short_name: 'PPDM Report',
        description:
          'Turn a Dell Live Optics PPDM export into a professional report and slide deck — 100% client-side.',
        theme_color: '#1d4ed8',
        background_color: '#ffffff',
        display: 'standalone',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  worker: { format: 'es' },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/echarts') || id.includes('node_modules/zrender')) {
            return 'echarts'
          }
        },
      },
    },
  },
})
