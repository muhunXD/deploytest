import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/',                // Serve from root (important for Azure)
  build: {
    outDir: 'dist',         // Output folder for production build
    emptyOutDir: true       // Clean old builds before output
  },
  server: {
    port: 5173,             // Local dev port
    open: true              // Auto-open browser during dev
  }
})
