import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        configure(proxy) {
          proxy.on('proxyRes', (proxyRes, request) => {
            const location = proxyRes.headers.location
            if (request.url?.startsWith('/api/auth/discord/callback') &&
                typeof location === 'string' && location.startsWith('/admin/')) {
              proxyRes.headers.location = `http://localhost:5174${location}`
            }
          })
        },
      },
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
