import { createRoot } from 'react-dom/client';
import { createBridge } from './bridge';
import App from './App';
import './shell.css';

createBridge();
createRoot(document.getElementById('root')!).render(<App />);
