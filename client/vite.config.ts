import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Every Rupee Counts',
        short_name: 'ERC',
        description: 'Personal finance tracker — expenses, investments, budgets & more',
        theme_color: '#0f5c4c',
        background_color: '#f4f7f5',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        shortcuts: [
          {
            name: 'Add Expense',
            short_name: 'Expense',
            url: '/transactions?new=expense',
            icons: [{ src: '/icons/shortcut-expense.png', sizes: '192x192' }],
          },
          {
            name: 'Dashboard',
            short_name: 'Home',
            url: '/dashboard',
            icons: [{ src: '/icons/shortcut-home.png', sizes: '192x192' }],
          },
        ],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
