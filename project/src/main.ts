import { mountApp } from './ui/index';
import './index.css';

const appContainer = document.getElementById('app');
if (appContainer) {
  mountApp(appContainer);
} else {
  console.error('App container not found');
}
