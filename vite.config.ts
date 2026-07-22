import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['ledger-mark.svg'],
      manifest: {
        name: 'Hours Ledger',
        short_name: 'Hours',
        description: 'A private, offline-first daily work hours ledger for one job.',
        theme_color: '#f3ebd9',
        background_color: '#f3ebd9',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/ledger-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/ledger-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,woff,woff2}']
      },
      devOptions: { enabled: true }
    })
  ]
})
