import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const coreSrc = path.resolve(__dirname, '../core/src');
const uiSrc = path.resolve(__dirname, '../ui/src');

export default defineConfig({
  plugins: [react()],
  base: '/pokerwise/',
  resolve: {
    alias: {
      '@pokerwise/ui/styles.css': uiSrc + '/styles.css',
      '@pokerwise/ui': uiSrc + '/index.js',
      '@pokerwise/core/debts': coreSrc + '/debts.js',
      '@pokerwise/core/colors': coreSrc + '/colors.js',
      '@pokerwise/core$': coreSrc + '/index.js',
      'react': path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      'react/jsx-runtime': path.resolve(__dirname, 'node_modules/react/jsx-runtime'),
      'react/jsx-dev-runtime': path.resolve(__dirname, 'node_modules/react/jsx-dev-runtime'),
    }
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
  build: {
    sourcemap: true,
  },
  server: {
    proxy: {
      '/pokerwise/api': {
        target: 'http://localhost:3010',
        rewrite: (p) => p.replace(/^\/pokerwise/, ''),
        changeOrigin: true,
      }
    }
  }
})