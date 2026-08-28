import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
    host: 'localhost',
    watch: {
      ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/*.tmpdir/**', '**/*.tmp'],
      usePolling: true,
      useFsEvents: false,
      interval: 1000,
      awaitWriteFinish: {
        pollInterval: 500,
        staleThreshold: 1000
      }
    },
    hmr: {
      host: 'localhost',
      clientPort: 3000
    },
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          icons: ['lucide-react'],
        },
      },
    },
  },
  optimizeDeps: {
    force: false
  }
});
