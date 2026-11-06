import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  // Inline empty PostCSS config to prevent Vite 8 from searching the filesystem
  // for a postcss config file and accidentally picking up a non-JS JSON file.
  css: {
    postcss: {},
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('framer-motion')) {
              return 'vendor-framer-motion';
            }
            if (id.includes('hls.js')) {
              return 'vendor-hls';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-lucide';
            }
            if (id.includes('@dnd-kit')) {
              return 'vendor-dnd-kit';
            }
            if (id.includes('react-virtuoso')) {
              return 'vendor-virtuoso';
            }
          }
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 55174,
    strictPort: true,
    allowedHosts: true,
    // Fix HMR WebSocket inside Tauri's webview — the embedded browser intercepts
    // WebSocket upgrades and returns 400 unless we explicitly configure the endpoint.
    hmr: {
      protocol: 'ws',
      host: '127.0.0.1',
      port: 55174,
    },
  },
})
