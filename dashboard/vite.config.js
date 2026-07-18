import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/v1': {
        target: 'https://cezkm5x4k8.execute-api.ap-south-1.amazonaws.com',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
