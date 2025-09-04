// vite.config.content.js
import { defineConfig } from 'vite';
import { resolve } from 'path';
import preact from '@preact/preset-vite'; // <-- 1. IMPORT THE PLUGIN

// Recreate __dirname for ES Modules
import { fileURLToPath } from 'url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [preact()], // <-- 2. ADD THE PLUGIN HERE
  build: {
    minify: false,
    sourcemap: 'inline',
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        content: resolve(__dirname, 'src/content-scripts/index.ts'),
      },
      output: {
        format: 'iife',
        entryFileNames: 'content.js'
      },
    },
  },
});