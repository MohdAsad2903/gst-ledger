import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import path from 'node:path';

export default defineConfig({
  base: './',
  root: path.resolve(__dirname, 'packages/ui'),
  publicDir: path.resolve(__dirname, 'packages/ui/public'),
  plugins: [
    react(),
    electron({
      main: {
        entry: path.resolve(__dirname, 'packages/app/src/main.ts'),
        vite: {
          build: {
            outDir: path.resolve(__dirname, 'dist-electron'),
            rollupOptions: {
              external: ['electron', 'better-sqlite3'],
            },
          },
        },
      },
      preload: {
        input: path.resolve(__dirname, 'packages/app/src/preload.ts'),
        vite: {
          build: {
            outDir: path.resolve(__dirname, 'dist-electron'),
            rollupOptions: {
              external: ['electron'],
              output: {
                format: 'cjs',
                entryFileNames: 'preload.cjs',
              },
            },
          },
        },
      },
    }),
  ],
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@gst/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@gst/data': path.resolve(__dirname, 'packages/data/src/index.ts'),
    },
  },
});
