import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'preview',
  publicDir: false,
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^fonts\/(.+)-latin-(\d+)-normal\.woff2$/,
        replacement: '@fontsource/$1/files/$1-latin-$2-normal.woff2',
      },
    ],
  },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4174 },
  build: {
    outDir: '../dist-web',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve('preview/index.html'),
        popup: resolve('preview/popup.html'),
        options: resolve('preview/options.html'),
      },
    },
  },
});
