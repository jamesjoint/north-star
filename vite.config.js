import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001'
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    fileParallelism: false,
    environmentMatchGlobs: [
      ['tests/client/**/*.{test,spec}.jsx', 'jsdom'],
      ['tests/server/**/*.{test,spec}.js', 'node'],
    ],
  }
})
