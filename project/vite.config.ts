// vite.config.ts - Unified configuration for all builds
import { defineConfig, type UserConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

// Recreate __dirname for ES Modules
import { fileURLToPath } from 'url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ command, mode }): UserConfig => {
  const isContentBuild = process.env.VITE_BUILD_TARGET === 'content';
  
  const baseConfig: UserConfig = {
    plugins: [
      svelte(),
      // Custom plugin to copy fonts
      {
        name: 'copy-fonts',
        writeBundle() {
          const fontsDir = resolve(__dirname, 'dist/fonts');
          if (!existsSync(fontsDir)) {
            mkdirSync(fontsDir, { recursive: true });
          }
          // Copy font files
          copyFileSync(
            resolve(__dirname, 'src/assets/fonts/inter.woff2'),
            resolve(__dirname, 'dist/fonts/inter.woff2')
          );
          copyFileSync(
            resolve(__dirname, 'src/assets/fonts/saira.woff2'),
            resolve(__dirname, 'dist/fonts/saira.woff2')
          );
        }
      }
    ],
    css: {
      postcss: './postcss.config.js', // Enable PostCSS processing for Tailwind
    },
    build: {
      minify: false,
      sourcemap: 'inline',
      outDir: 'dist',
      emptyOutDir: !isContentBuild, // Only empty on main build, not content build
      cssCodeSplit: !isContentBuild, // Disable CSS code splitting for content scripts
    },
  };

  if (isContentBuild) {
    // Content script build configuration
    baseConfig.build!.rollupOptions = {
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
    };
  } else {
    // Main app and background build configuration
    baseConfig.build!.rollupOptions = {
      input: {
        main: resolve(__dirname, 'index.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
      },
      output: {
        format: 'esm',
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    };
  }

  return baseConfig;
});
