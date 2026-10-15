# Login Pal product page

Open `index.html` directly or serve this directory with a static server. All fonts, styles and scripts are packaged locally. The page is independent of the extension build and never reads extension storage.

`index.html` explains the extension and provides a synthetic account demo, first-use instructions, developer installation, local/offline behavior, permissions and questions. `docs.html` retains detailed documentation and direct topic links. Both pages share `styles.css`, `tokens.css`, the additive `guide.css` and `product.css`, and `main.js`.

## Design

The Apple-inspired presentation uses a white canvas, silver surfaces, near-black headings, blue actions, and system typography. The centered introduction leads into a larger interactive product demonstration. One primary action points to local installation; trying the demo is secondary. JetBrains Mono remains packaged for code. Previous locally packaged fonts and their licenses remain available as historical assets.

The full-width navigation stays at the top while scrolling and indicates the current linked section. Below 960px it retains the menu dialog and local-install action. The softened hero spotlight follows mouse input across the full browser width, including both margins around the centered content, fades on exit, and stays disabled for touch and reduced motion.

`tokens.css` owns the current palette and typography. `product.css` owns the new presentation over the retained component layouts in `styles.css` and `guide.css`. Branding retains the existing Login Pal mark. Historical Hallmark records are scoped to `.hallmark/`. The selected design and implementation contract is recorded in `../docs/plans/2026-10-12-product-page-apple-design.md`.

The reading order follows the product story before installation. Workflow and website-access details use native disclosures to keep technical instructions available without overwhelming the first read. The documentation page shares the typography, navigation, spacing and color system.

## Interactive demo

### Alternate interactive hero

`index-v2.html` is an alternate homepage with the same Apple-inspired presentation and product content. Its faint login-window illustration and floating CSV, setup, and team-chat notes add two mouse-responsive depth layers. Clicking or keyboard-activating a note opens its matching demo step, scrolls the demo into view, and focuses its heading through the existing `data-demo-step` controls.

The layers move by at most 8px horizontally and 5px vertically, with one update per animation frame. Pointer exit, scrolling, resize, blur, visibility changes, and preference changes reset them. Touch and narrow screens stay static. Below 768px, two compact notes remain and the background form detail is hidden. Reduced motion and `?reduce=1` disable movement, including hover transforms. There is no autoplay or continuous animation in the background. Without JavaScript, note controls are hidden and the original readable demo remains.

The variant adds only `hero-v2.css` and `hero-v2.js`; edit `hero-v2.ts` and regenerate its script using the commands below. Homepage navigation stays within `index-v2.html`; the original `index.html` and shared scripts/styles are unchanged by this variant.

### Walkthrough controls

The page opens on **Choose**, without autoplay. Search fictional names, emails or roles, filter by role, choose an account, and select **Preview fill**. The final illustration carries the selected name and explains that the user presses the website’s Sign in button. No passwords are included or used. A search with no matches disables filling and gives recovery guidance.

**Play tour** starts the Before → Import → Approve → Choose → Fill walkthrough. It runs once (14 seconds total), then stops. Scene buttons provide manual access; the first-use guide also links back to specific scenes. Interaction stops automatic progression. Hovering over a scene temporarily pauses playback. Leaving the viewport, hiding the browser tab or opening navigation also pauses playback. Reduced motion disables playback and scene animation entirely. Inactive panels reserve layout space but are inert and hidden from assistive technology.

The `/` shortcut opens and focuses search outside editable fields or the navigation dialog. The dialog supports Escape, a close control and backdrop dismissal.

The installation checklist is session-only: it does not store progress. Its checkboxes and progress text appear only with JavaScript; without JavaScript the numbered instructions remain. Clicking an instruction also toggles its checkbox. **Copy extensions address** copies `chrome://extensions` with an inline success message or a manual-entry fallback when clipboard access is unavailable.

Without JavaScript the sample picker remains readable, numbered setup instructions remain visible, and native documentation/FAQ disclosures still work. Role filters and tour controls are hidden.

## Source and generation

Edit `main.ts`, then validate and regenerate `main.js` from the repository root:

```sh
rtk proxy node node_modules/typescript/bin/tsc .product-page/main.ts --target ES2020 --lib ES2020,DOM --strict --skipLibCheck --module esnext --noEmit --ignoreConfig
rtk proxy node_modules/.bin/esbuild .product-page/main.ts --outfile=.product-page/main.js --target=es2020
```

Validate and regenerate the alternate hero script:

```sh
rtk proxy node node_modules/typescript/bin/tsc .product-page/hero-v2.ts --target ES2020 --lib ES2020,DOM --strict --skipLibCheck --module esnext --noEmit --ignoreConfig
rtk proxy node_modules/.bin/esbuild .product-page/hero-v2.ts --outfile=.product-page/hero-v2.js --target=es2020
```

Deterministic visual capture still supports `?t=2.8`, `?t=5.8`, `?t=8.3`, `?t=10.8` and `?t=13.3`; `?reduce=1` forces reduced-motion behavior. These are review controls, not product features.

See `AUDIT.md` for the design findings and `VERIFICATION.md` for observed checks and limitations. No extension package or Web Store release is offered by this page.
