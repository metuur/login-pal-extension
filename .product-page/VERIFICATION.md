# Verification — 2026-10-07

- Strict TypeScript check passed for main.ts.
- Chromium verified synthetic account selection, search by role, zero-result state, disabled empty selection, and the demo response.
- FAQ expansion, mobile menu, Escape dismissal, and slash-to-search shortcut passed.
- No horizontal document overflow at 320, 390, 768, 1024, and 1440 pixels.
- Desktop and mobile full-page screenshots visually reviewed.
- Reduced-motion layout and ordinary entry reveal verified. No JavaScript runtime errors observed.
- Local fonts and static assets; no extension storage access, real credentials, or remote application services.
- Page is separate from extension runtime. Extension tests were not rerun for this standalone documentation UI; actual website autofill compatibility remains outside this page's scope.

## Offline, permissions, and documentation expansion

- Product content verified against current `src/domain/rules.ts`, `src/options/index.ts`, `src/background/service.ts`, `src/content/fields.ts`, and `scripts/build.mjs`. Current code supersedes the older loopback-only HTTP and required-success-tracking wording in historical documents.
- Chrome permission descriptions cross-checked with official Chrome Extensions documentation through Context7; the page links to the official permission guide.
- All six topic links open their target; direct documentation hash links also open on initial load. All internal anchors resolve.
- Expanded permissions and documentation checked at 320, 390, 768, 1024, and 1440 pixels with no horizontal overflow. Desktop and mobile screenshots inspected.
- Mobile Docs navigation closes its menu correctly. Already-loaded product-page search and documentation work with browser networking disabled. This checks the product page, not offline authentication to an external service.
- Strict TypeScript check passed. No JavaScript errors during browser verification. Extension runtime unchanged.
