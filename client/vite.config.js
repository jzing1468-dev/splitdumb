import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/splitdumb/',
  server: {
    proxy: {
      '/splitdumb/api': {
        target: 'http://localhost:3001',
        rewrite: (path) => path.replace(/^\/splitdumb/, ''),
        changeOrigin: true,
      }
    }
  }
})