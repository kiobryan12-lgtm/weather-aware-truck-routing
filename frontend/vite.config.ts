import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        // Separate long-cached chunk for the large map library.
        output: { manualChunks: { maplibre: ['maplibre-gl'] } },
      },
      chunkSizeWarningLimit: 1100,
    },
    server: {
      // IPv4 explicitly: "localhost" can resolve to ::1 only on Windows.
      host: '127.0.0.1',
      port: 5173,
      proxy: { '/api': env.API_PROXY_TARGET || 'http://127.0.0.1:8000' },
    },
    preview: { host: '127.0.0.1' },
  };
});
