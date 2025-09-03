import { render } from 'preact';
import { App } from './App';

export function mountApp(container: Element): void {
  try {
    render(<App />, container);
  } catch (error) {
    console.error('Failed to mount Preact application:', error);
  }
}