import { installPageBridge } from './bridge';
import '../public/ui.css';
import './view.css';
if (window.parent === window) {
  location.replace('/?view=settings');
} else {
  installPageBridge('options.html');
  await import('../src/options/index');
}
