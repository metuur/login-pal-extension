# Login Pal product page

Open `index.html` directly or serve this directory with a static server. All fonts, styles and scripts are packaged locally. The page is independent of the extension build and never reads extension storage.

`index.html` explains the extension and provides a synthetic account demo, first-use instructions, developer installation, local/offline behavior, permissions and questions. `docs.html` retains detailed documentation and direct topic links. Both pages share `styles.css`, `tokens.css`, the additive `guide.css`, and `main.js`.

## Design

The 2026-10-07 redesign combines the warm paper, upright serif and green of Hallmark’s Hollowback Apiary example with Tally’s readable product presentation. Hyperlane informs responsive interaction feedback, adapted to useful demo controls rather than a countdown or cursor spotlight. The original stylesheet is preserved; `guide.css` applies the product guide’s visual system. Hallmark records are scoped to `.hallmark/` here, not the extension UI.

Geist remains the body face. Young Serif is packaged locally for headings under `YOUNG-SERIF-LICENSE.txt`; Geist’s license is in `FONT-LICENSE.txt`. Branding assets retain the existing Login Pal mark. Run `rtk npm run generate:assets` from the repository root only when changing the source branding asset.

## Interactive demo

The page opens on **Choose**, without autoplay. Search fictional names, emails or roles, filter by role, choose an account, and select **Preview fill**. The final illustration carries the selected name and explains that the user presses the website’s Sign in button. No passwords are included or used. A search with no matches disables filling and gives recovery guidance.

**Play tour** starts the Before → Import → Approve → Choose → Fill walkthrough. It runs once (14 seconds total), then stops. Scene buttons provide manual access; the first-use guide also links back to specific scenes. Interaction stops automatic progression. Hovering over a scene temporarily pauses playback. Leaving the viewport, hiding the browser tab or opening navigation also pauses playback. Reduced motion disables playback and scene animation entirely. Inactive panels reserve layout space but are inert and hidden from assistive technology.

The `/` shortcut opens and focuses search outside editable fields or the navigation dialog. The dialog supports Escape, a close control and backdrop dismissal.

The installation checklist is session-only: it does not store progress. Its checkboxes and progress text appear only with JavaScript; without JavaScript the numbered instructions remain. **Copy extensions address** copies `chrome://extensions` with an inline success message or a manual-entry fallback when clipboard access is unavailable.

Without JavaScript the sample picker remains readable, numbered setup instructions remain visible, and native documentation/FAQ disclosures still work. Role filters and tour controls are hidden.

## Source and generation

Edit `main.ts`, then validate and regenerate `main.js` from the repository root:

```sh
rtk proxy node node_modules/typescript/bin/tsc .product-page/main.ts --target ES2020 --lib ES2020,DOM --strict --skipLibCheck --module esnext --noEmit --ignoreConfig
rtk proxy node_modules/.bin/esbuild .product-page/main.ts --outfile=.product-page/main.js --target=es2020
```

Deterministic visual capture still supports `?t=2.8`, `?t=5.8`, `?t=8.3`, `?t=10.8` and `?t=13.3`; `?reduce=1` forces reduced-motion behavior. These are review controls, not product features.

See `AUDIT.md` for the design findings and `VERIFICATION.md` for observed checks and limitations. No extension package or Web Store release is offered by this page.
