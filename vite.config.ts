import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { CONF_DIR, readConfFile } from './src/config.ts';

// Builds the dashboard client into dist/dashboard, which src/web/server.ts serves at
// /dashboard. In `npm run dev:client`, API calls are proxied to the running app, on the
// port the app reads from conf/ (a build needs no conf/).
const appPort = process.env.PORT ?? readConfFile(CONF_DIR)?.PORT ?? '3000';

export default defineConfig({
  root: 'src/web/client',
  base: '/dashboard/',
  plugins: [vue(), tailwindcss()],
  build: {
    outDir: '../../../dist/dashboard',
    emptyOutDir: true,
  },
  server: {
    proxy: { '/api': `http://localhost:${appPort}` },
  },
});
