import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const coreSrc = path.resolve(__dirname, '../core/src');
const uiSrc = path.resolve(__dirname, '../ui/src');

export default defineConfig({
  plugins: [react()],
  base: '/splitdumb/',
  resolve: {
    alias: {
      // UI package — resolve from source so there's only one React instance
      '@splitdumb/ui/styles.css': uiSrc + '/styles.css',
      '@splitdumb/ui': uiSrc + '/index.js',
      // Core package — resolve from source
      '@splitdumb/core/debts': coreSrc + '/debts.js',
      '@splitdumb/core/splits': coreSrc + '/splits.js',
      '@splitdumb/core/colors': coreSrc + '/colors.js',
      '@splitdumb/core/categories': coreSrc + '/categories.js',
      '@splitdumb/core/validators': coreSrc + '/validators.js',
      '@splitdumb/core$': coreSrc + '/index.js',
      // Force single React — resolve from client's node_modules for all source paths
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
      '/splitdumb/api': {
        target: 'http://localhost:3001',
        rewrite: (path) => path.replace(/^\/splitdumb/, ''),
        changeOrigin: true,
      }
    }
  }
})