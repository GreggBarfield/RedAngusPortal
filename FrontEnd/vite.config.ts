import path from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:4200',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    // A busy machine (the server build) can need much longer than the 5 second default.
    testTimeout: 30000,
    setupFiles: ['./src/test/setup.ts'],
  },
})
