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

## Separate documentation page

- Moved all six detailed topics to `docs.html`; confirmed no documentation section remains on the homepage.
- Verified identical header and footer markup across both pages, cross-page navigation, direct topic URLs, and mobile-menu navigation back to the homepage.
- Confirmed homepage demo still works and shared JavaScript runs without errors on the documentation page without demo elements.
- Expanded topics checked at 320, 390, 768, and 1440 pixels with no horizontal overflow. Desktop/mobile documentation screenshots reviewed. Strict TypeScript check passed.

## Documentation illustrations

- Added three captioned, locally rendered HTML/CSS figures for setup flow, origin matching, and field detection. Only synthetic metadata and empty mock inputs appear.
- Visually reviewed desktop setup/domain illustrations and mobile detection illustration. All three have accessible caption associations.
- Topic navigation and expanded figures passed at 320, 390, 768, 1024, and 1440 pixels without document overflow or JavaScript errors.

## Hallmark audit remediation — 2026-10-07

- Strict TypeScript check passed; browser JavaScript regenerated from main.ts.
- Chromium checked homepage and documentation at 320, 375, 414, 768, 1024, and 1440 pixels: no horizontal document overflow. Documentation topics were expanded during the checks.
- Desktop and mobile screenshots inspected, including all four Hallmark widths (320 / 375 / 414 / 768). Primary links remain on one line; documentation navigation becomes a single column on small screens.
- Demo role search, account selection, empty results, disabled action, recovery after clearing, and selected-account response passed using fictional metadata.
- Slash-to-search, native mobile dialog, Escape dismissal, cross-page Docs navigation, direct storage-topic opening, and local anchors passed.
- Reduced-motion rendering and offline demo search passed. No browser runtime errors were observed.
- The first Escape assertion read aria-expanded before the native close event ran; waiting for the close event's observable state confirmed the behavior without changing the implementation.
- Shared documentation layout was checked; detailed documentation content and extension behavior were not redesigned. Full extension tests were not needed for this standalone page-only change.

## Native hero walkthrough — 2026-10-07

- Strict TypeScript check passed; checked-in JavaScript regenerated from `main.ts`.
- Chromium rendered all four frozen stages at 320, 375, 414, 768, 1024, and 1440 pixels. No horizontal document overflow; the walkthrough window retained the same height across all four stages at each width. Desktop and mobile screenshots inspected.
- Observed a real six-second automatic step change, pause/resume without clock advancement while paused, remaining stage transitions, finite completion, and replay.
- Verified direct step selection, demo entry, role search, selected-name transfer to the fill illustration, zero results, disabled empty selection, recovery, and slash-to-search. Only the active panel is available to keyboard focus; moving from the picker to the result focuses the result heading.
- The demo link and direct account-search URL focus the search input. Step announcements preserve spaces across heading line breaks. Manual navigation and search also work when the browser animation API is unavailable.
- Verified offscreen pause/resume, live reduced-motion preference changes, no autoplay under reduced motion, and a completed manual fade without movement. Mobile-menu opening pauses playback; Escape closes the menu.
- Offline search, readable JavaScript-disabled fallback, and the shared documentation page passed. No JavaScript errors or remote requests observed.
- Checks cover the standalone product page in Chromium. Extension runtime and real website autofill were not changed or exercised.

## Faster hero pacing

- Shortened each stage from six to three seconds, for a 12-second tour. Strict TypeScript check passed and browser JavaScript was regenerated.
- Chromium observed all automatic transitions and completion at the new cadence. All four updated frozen-stage URLs resolve correctly; no browser errors observed.

## Looping playback and motion within each step

- Changed default playback to a repeating 10-second tour: four 2.5-second stages. Observed a full automatic cycle, the return to Import, and the following Authorize step in Chromium.
- Added staggered CSV rows, a transfer arrow and group entrance, field-configuration sweeps, site-approval confirmation, account-selection emphasis, and sequential fill indicators. Pause/resume freezes the stage progress and detail animations together.
- Verified that interacting with search pauses the loop, selection reaches the fill illustration, and the manual fill scene animates while its heading receives focus. It stays on that step until the visitor resumes playback or chooses another step.
- All stages retain equal panel heights with no horizontal overflow at 320, 375, 768, and 1440 pixels. Desktop and mobile screenshots, intermediate frames, the loop seam, and the reduced-motion version were visually reviewed.
- Reduced motion retains manual navigation with a short fade and no automatic progression or inner movement. Frozen timestamps now wrap across loop boundaries.
- Strict TypeScript and formatting checks passed. No browser errors or remote requests observed. Generated browser JavaScript updated; extension runtime unchanged.
