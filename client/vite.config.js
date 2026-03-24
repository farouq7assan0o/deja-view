import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Proxy all /api requests to the Express server during dev
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  // Allow large face-api model files
  assetsInclude: ['**/*.bin'],
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
