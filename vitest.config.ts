import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/core/src/**/*.ts'],
      exclude: ['packages/core/src/**/*.{test,spec}.ts', 'packages/core/src/types.ts'],
    },
  },
  resolve: {
    alias: {
      '@gst/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@gst/data': path.resolve(__dirname, 'packages/data/src/index.ts'),
      '@gst/app': path.resolve(__dirname, 'packages/app/src'),
      '@gst/ui': path.resolve(__dirname, 'packages/ui/src'),
    },
  },
});
