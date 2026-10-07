# Login Pal product page

Open `index.html` directly in a browser. All fonts, styles, and scripts are local; there are no runtime dependencies or network services. The page is independent of the extension build.

Detailed documentation lives in `docs.html`, with the same header and footer as the homepage. Both pages share `styles.css` and `main.js`. Homepage documentation links go to that page and preserve topic anchors; the homepage no longer embeds the documentation guide.

The soft structural editorial design introduces the extension, offers a synthetic account-picker demo, and walks through developer installation, CSV import, profile authorization, and manual login. Product wording follows the current HLD/LLD/EARS amendments and repository README. No extension package is bundled or falsely offered for download.

The offline section distinguishes local account management from the target website’s connectivity. The access section explains site permissions and local storage, scripting, active-tab, and clipboard permissions. Six expandable documentation topics cover settings, accepted HTTP/HTTPS domains, field detection, matching rules, optional success tracking, and local data/troubleshooting. Documentation links open the relevant topic directly. Current implementation is the source for features that supersede older contract wording.

After editing strict TypeScript source, regenerate its checked-in browser script from the repository root:

```sh
rtk proxy node node_modules/typescript/bin/tsc .product-page/main.ts --target ES2020 --lib ES2020,DOM --strict --skipLibCheck --module esnext --noEmit --ignoreConfig
rtk proxy node_modules/.bin/esbuild .product-page/main.ts --outfile=.product-page/main.js --target=es2020
```

Geist fonts are packaged under the license in `FONT-LICENSE.txt`. Demo names and example.com addresses are fictional. No passwords are included or used by this demo.

## Hero walkthrough

The hero explains Import → Authorize → Choose → Fill in four six-second stages. Browser-native animations reveal the sample CSV, site configuration, account picker, and illustrative fill result. Playback runs once, with Pause, Play, Replay, and direct step controls. The picker preserves search and account selection; “Try autofill” carries the selected fictional name into the last stage. The website's Login action remains the user's responsibility.

Interacting with a panel stops automatic progression. Playback also pauses when the walkthrough leaves the viewport, the browser tab is hidden, or the mobile menu opens. Reduced-motion preferences disable autoplay and movement; manual step changes use a 120ms fade. Inactive stages reserve layout space but are hidden from assistive technology and keyboard focus. Without JavaScript, the original sample picker remains readable.

For deterministic visual review, open `index.html?t=3`, `?t=9`, `?t=15`, or `?t=21` to freeze each stage. `?reduce=1` forces reduced-motion navigation. The walkthrough uses the existing page files and requires no animation library, video, iframe, or remote asset.

## Hallmark audit improvements — 2026-10-07

The homepage now defines Login Pal in its opening paragraph and leads with installation and a synthetic demo. It follows with account organization, the first-login workflow, installation, offline behavior, local data, permissions, and questions. Headings describe the task rather than repeating promotional slogans. Synthetic-only usage and manual submission are stated at the start.

Shared typography is larger, the demo is upright, instructions no longer animate into view, and the docs topic navigation uses one column on narrow screens. `tokens.css` supplies semantic tokens for the focused improvements; `styles.css` preserves the legacy stylesheet and appends overrides. This is an audit remediation pass, not a replacement brand or full Hallmark theme migration. See `AUDIT.md` for findings and remaining design debt.
