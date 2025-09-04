import { render } from 'preact';

// empty div with id 'app' in index.html
function App() {
    return <h1>Nothing to see</h1>;

}

render(<App />, document.getElementById('app')!);