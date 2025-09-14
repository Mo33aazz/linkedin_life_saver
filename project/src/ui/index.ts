import { mount as svelteMount, unmount as svelteUnmount } from 'svelte';
import App from './App.svelte';

let appInstance: any = null;

export function mountApp(container: Element): void {
  try {
    if (appInstance) {
      unmountApp();
    }
    // Prefer Svelte v5 mount API; fall back to Svelte v3/4 constructor if needed
    try {
      appInstance = svelteMount(App as any, { target: container });
    } catch (err) {
      // Fallback for older component shape
      // @ts-ignore - constructor signature for legacy builds
      appInstance = new (App as any)({ target: container });
    }
  } catch (error) {
    console.error('Failed to mount Svelte application:', error);
  }
}

export function unmountApp(): void {
  try {
    if (appInstance) {
      try {
        svelteUnmount(appInstance);
      } catch {
        // Legacy destroy path
        if (typeof appInstance.$destroy === 'function') {
          appInstance.$destroy();
        }
      }
      appInstance = null;
    }
  } catch (error) {
    console.error('Failed to unmount Svelte application:', error);
  }
}
