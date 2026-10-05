import { createRoot } from 'react-dom/client';
import { createBridge } from './bridge';
import App from './App';
import '../public/ui.css';
import './shell.css';

createBridge();
createRoot(document.getElementById('root')!).render(<App />);
