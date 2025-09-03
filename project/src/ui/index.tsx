import { h, render } from 'preact';

const App = () => {
  return (
    <div>
      <h1>LinkedIn Engagement Assistant</h1>
      <p>Sidebar UI Placeholder</p>
    </div>
  );
};

export function init(element: HTMLElement) {
  render(<App />, element);
}