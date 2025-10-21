import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    
    // --- ADD THIS PROXY SECTION ---
    proxy: {
      // Requests to /api/analyze-symptoms will be sent to the backend
      '/api': {
        target: 'http://localhost:5000', // Your backend server
        changeOrigin: true, // Recommended setting
        secure: false,      // Do not require SSL
      }
    }
    // ---------------------------------
  }
})