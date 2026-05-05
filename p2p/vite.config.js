import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreSrc = path.resolve(__dirname, '../core/src');
const uiSrc = path.resolve(__dirname, '../ui/src');

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@splitdumb/core/debts': coreSrc + '/debts.js',
      '@splitdumb/core/splits': coreSrc + '/splits.js',
      '@splitdumb/core/colors': coreSrc + '/colors.js',
      '@splitdumb/core/categories': coreSrc + '/categories.js',
      '@splitdumb/core/validators': coreSrc + '/validators.js',
      '@splitdumb/core$': coreSrc + '/index.js',
      '@splitdumb/ui/styles.css': uiSrc + '/styles.css',
      '@splitdumb/ui': uiSrc + '/index.js',
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          'y-indexeddb': ['y-indexeddb'],
        }
      }
    }
  },
  optimizeDeps: {
    include: ['y-indexeddb', 'yjs', 'trystero'],
  },
});