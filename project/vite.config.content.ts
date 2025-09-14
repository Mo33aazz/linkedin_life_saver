// vite.config.content.js
import { defineConfig } from 'vite';
import { resolve } from 'path';
import { svelte } from '@sveltejs/vite-plugin-svelte'; // <-- 1. IMPORT THE PLUGIN

// Recreate __dirname for ES Modules
import { fileURLToPath } from 'url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [svelte()], // <-- 2. ADD THE PLUGIN HERE
  css: {
    postcss: './postcss.config.js', // Enable PostCSS processing for Tailwind
  },
  build: {
    minify: false,
    sourcemap: 'inline',
    outDir: 'dist',
    emptyOutDir: false,
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content-scripts/index.ts'),
      },
      output: {
        format: 'iife',
        entryFileNames: 'content.js',
        assetFileNames: 'assets/[name].[ext]',
        inlineDynamicImports: false,
      },
      external: [],
    },
  },
});