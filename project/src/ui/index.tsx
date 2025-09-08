import { render } from 'preact';
import { App } from './App';

export function mountApp(container: Element): void {
  try {
    render(<App />, container);
  } catch (error) {
    console.error('Failed to mount Preact application:', error);
  }
}

export function unmountApp(container: Element): void {
  try {
    // Render null to unmount the tree and trigger cleanup effects
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(null as any, container);
  } catch (error) {
    console.error('Failed to unmount Preact application:', error);
  }
}
