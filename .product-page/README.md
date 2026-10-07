# Account Login Assistant product page

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
