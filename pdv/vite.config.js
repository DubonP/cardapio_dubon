import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/pdv/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      workbox: {
        navigateFallback: '/pdv/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        name: 'Dubon — PDV',
        short_name: 'Dubon PDV',
        start_url: '/pdv/',
        scope: '/pdv/',
        display: 'standalone',
        theme_color: '#24348B',
        background_color: '#24348B',
        icons: [
          { src: '/pdv/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pdv/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
})
