import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const directory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(directory, './src') } },
  server: { proxy: { '/api': 'http://localhost:3001' } },
})
