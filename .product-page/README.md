# Account Login Assistant product page

Open `index.html` directly in a browser. All fonts, styles, and scripts are local; there are no runtime dependencies or network services. The page is independent of the extension build.

The soft structural editorial design introduces the extension, offers a synthetic account-picker demo, and walks through developer installation, CSV import, profile authorization, and manual login. Product wording follows the current HLD/LLD/EARS amendments and repository README. No extension package is bundled or falsely offered for download.

After editing strict TypeScript source, regenerate its checked-in browser script from the repository root:

```sh
rtk proxy node node_modules/typescript/bin/tsc .product-page/main.ts --target ES2020 --lib ES2020,DOM --strict --skipLibCheck --module esnext --noEmit --ignoreConfig
rtk proxy node_modules/.bin/esbuild .product-page/main.ts --outfile=.product-page/main.js --target=es2020
```

Geist fonts are packaged under the license in `FONT-LICENSE.txt`. Demo names and example.com addresses are fictional. No passwords are included or used by this demo.
