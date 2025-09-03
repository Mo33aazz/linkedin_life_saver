import { render } from 'preact';
import './index.css';

function App() {
  return (
    <>
      <h1>Hello World</h1>
    </>
  );
}

render(<App />, document.getElementById('app')!);