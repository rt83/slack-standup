import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

// Server tests run in Node; client tests opt into a DOM with `// @vitest-environment happy-dom`.
export default defineConfig({
  plugins: [vue()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
