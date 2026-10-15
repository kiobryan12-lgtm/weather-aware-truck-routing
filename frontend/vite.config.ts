import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        // maplibre is big and rarely changes, keep it in its own chunk
        output: { manualChunks: { maplibre: ['maplibre-gl'] } },
      },
      chunkSizeWarningLimit: 1100,
    },
    server: {
      // "localhost" resolved to ::1 only on Windows and the browser couldn't connect
      host: '127.0.0.1',
      port: 5173,
      proxy: { '/api': env.API_PROXY_TARGET || 'http://127.0.0.1:8000' },
    },
    preview: { host: '127.0.0.1' },
  };
});
