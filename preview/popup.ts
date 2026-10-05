import { installPageBridge } from './bridge';
import '../public/ui.css';
import './view.css';
if (window.parent === window) {
  location.replace('/');
} else {
  installPageBridge('popup.html');
  await import('../src/popup/index');
}
