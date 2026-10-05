import { installPageBridge } from './bridge';
import '../public/ui.css';
if (window.parent === window) {
  location.replace('/?view=popup');
} else {
  installPageBridge('popup.html');
  await import('../src/popup/index');
}
