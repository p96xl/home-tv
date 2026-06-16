import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/settings': {
        target: 'http://127.0.0.1:8000',
        configure: (proxy) => { proxy.on('error', () => {}) },
      },
    },
  },
})
