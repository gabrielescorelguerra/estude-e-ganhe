import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// base relativa: funciona em hospedagem estática, em subpastas e dentro do WebView do Capacitor
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // usamos public/manifest.webmanifest
      injectRegister: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,json,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  build: { target: 'es2020', chunkSizeWarningLimit: 700 },
});
