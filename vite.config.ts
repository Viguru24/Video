import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 55173,
    strictPort: true,
    allowedHosts: true,
    // Fix HMR WebSocket inside Tauri's webview — the embedded browser intercepts
    // WebSocket upgrades and returns 400 unless we explicitly configure the endpoint.
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 55173,
    },
  },
})
