import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { CONF_DIR, readConfFile, serverPortIn } from './src/config.ts';

// Builds the dashboard client into dist/dashboard, which src/web/server.ts serves at
// /dashboard. In `npm run dev:client`, API calls are proxied to the running app, on the
// port in conf/app.yaml. A build needs no conf/.
const appPort = serverPortIn(readConfFile(CONF_DIR));

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
