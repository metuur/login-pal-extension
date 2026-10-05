import { installPageBridge } from './bridge';
import '../public/ui.css';
if (window.parent === window) {
  location.replace('/?view=options');
} else {
  installPageBridge('options.html');
  await import('../src/options/index');
}
