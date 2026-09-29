import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// Builds the dashboard client into dist/dashboard, which src/web/server.ts serves at
// /dashboard. In `npm run dev:client`, API calls are proxied to the running app.
export default defineConfig({
  root: 'src/web/client',
  base: '/dashboard/',
  plugins: [vue(), tailwindcss()],
  build: {
    outDir: '../../../dist/dashboard',
    emptyOutDir: true,
  },
  server: {
    proxy: { '/api': `http://localhost:${process.env.PORT ?? 3000}` },
  },
});
