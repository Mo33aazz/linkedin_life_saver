// vite.config.js
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

// Recreate __dirname for ES Modules
import { fileURLToPath } from 'url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [svelte()],
  css: {
    postcss: './postcss.config.js', // Enable PostCSS processing for Tailwind
  },
  build: {
    minify: false,
    sourcemap: 'inline',
    outDir: 'dist',
    // This build runs first, so it should empty the directory.
    emptyOutDir: true, 
    rollupOptions: {
      // Define entry points for popup and background
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
      },
      output: {
        format: 'esm',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
});