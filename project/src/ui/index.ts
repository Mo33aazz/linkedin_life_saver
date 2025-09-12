import { mount, unmount } from 'svelte';
import App from './App.svelte';

let appInstance: any = null;

export function mountApp(container: Element): void {
  try {
    if (appInstance) {
      unmountApp();
    }
    appInstance = mount(App, {
      target: container
    });
  } catch (error) {
    console.error('Failed to mount Svelte application:', error);
  }
}

export function unmountApp(): void {
  try {
    if (appInstance) {
      unmount(appInstance);
      appInstance = null;
    }
  } catch (error) {
    console.error('Failed to unmount Svelte application:', error);
  }
}
