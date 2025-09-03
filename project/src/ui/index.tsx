import { h, render } from 'preact';
import { App } from './App';

export function init(element: HTMLElement) {
  render(<App />, element);
}