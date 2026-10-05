import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'preview',
  publicDir: resolve('.preview-assets'),
  plugins: [
    react(),
    {
      name: 'extension-font-paths',
      enforce: 'pre',
      transform(code, id) {
        if (id.endsWith('/public/ui.css')) return code.replaceAll("url('fonts/", "url('/fonts/");
      },
    },
  ],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
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
