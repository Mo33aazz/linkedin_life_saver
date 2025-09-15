import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  // Consult https://svelte.dev/docs#compile-time-svelte-preprocess
  // for more information about preprocessors
  preprocess: vitePreprocess(),

  compilerOptions: {
    // Enable runtime checks in development
    dev: process.env.NODE_ENV === 'development',
  },

  // Vite plugin options
  vitePlugin: {
    // Exclude test files from being processed
    exclude: ['**/tests/**', '**/*.test.{js,ts,svelte}'],
    // Enable hot module replacement
    hot: process.env.NODE_ENV === 'development',
  },
};
