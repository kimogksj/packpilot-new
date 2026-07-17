import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/packpilot/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'PackPilot',
        short_name: 'PackPilot',
        description: '個人工作階段與中斷追蹤工具',
        theme_color: '#09111f',
        background_color: '#09111f',
        display: 'standalone',
        start_url: '/packpilot/',
        scope: '/packpilot/',
        icons: [
          { src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,webmanifest}'] },
    }),
  ],
})
