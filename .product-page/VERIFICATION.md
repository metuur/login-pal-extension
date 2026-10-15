## Transparent illustration background — 2026-10-14

- Removed the illustration's white overlay and made the browser frame and decorative fields transparent. A mask fades only the illustration, allowing the mouse spotlight to remain visible underneath without the previous rectangular cutoff.
- Chromium screenshots before/after at the same pointer position confirmed the blue glow is visible through the illustration. Note activation, the 375px layout without horizontal overflow, reduced-motion behavior, formatting and whitespace checks passed.

## Alternate hero background — 2026-10-14

- Added `index-v2.html` with a local HTML/CSS login-window illustration and three notes linked to Import, Approve, and Choose. The original homepage and shared runtime/styles are unchanged. The variant uses its own stylesheet and generated TypeScript script.
- Chromium checked 320, 375, 414, 768, 1024, 1280, 1440 and 1920px: no horizontal document overflow. Two compact notes appear on phones; all three appear from 768px. Every visible note opened the correct scene and focused its heading. Desktop/tablet/mobile screenshots were visually inspected; faint background form text was removed on compact layouts to keep the hero copy clear.
- Observed mouse movement in both axes within the 8px/5px bounds, live reduced-motion cleanup, forced static mode including hover, keyboard Enter/Space note activation, touch activation without depth movement, mobile-menu/Escape behavior, installation checkbox labels, and the existing search/filter/fill demo.
- All local links and fragments resolve. Each note's source label, question, and action met 4.5:1 text contrast. The JavaScript-disabled fallback hid note controls and retained the readable picker with no overflow. No browser runtime errors or remote runtime requests were observed.
- Strict standalone TypeScript, generated JavaScript, formatting and whitespace checks passed. No extension behavior or storage changed; extension tests were not rerun for this standalone variant.

## Apple-inspired product UX — 2026-10-12

- Implemented the user's selected white/silver direction, system typography, centered hero, larger interactive showcase, slim full-width sticky navigation, blue primary install action, and shared documentation presentation. Preserved the full-width spotlight and original product mark.
- Reordered the product story before installation, added native disclosures for workflow and permission details, and associated installation text with checkboxes. All local links and fragments resolve.
- Chromium checked all five scenes at 320, 375, 414, 768, 1024, 1440 and 1920px: no horizontal document overflow and a stable walkthrough height at every width. Desktop/mobile product and documentation screenshots visually reviewed; landscape navigation checked at 767×375px.
- Demo entry/focus, role search and filtering, empty results and disabled fill, selected-name transfer, slash shortcut, active-section navigation at directory and index URLs, sticky position, disclosures, mobile menu/Escape, checkbox progress, and clipboard success/failure passed. Observed the opt-in tour advance, pause without progressing, resume, finish, and stop.
- Full-width pointer tracking/exit, touch exclusion, reduced-motion manual navigation, expanded docs/deep links, readable no-JavaScript fallback, and 200% root-font sizing without horizontal overflow passed. No browser runtime errors or external runtime requests observed.
- Targeted rendered-text contrast checks across all five reduced-motion scenes and expanded homepage/docs disclosures found no failures at 4.5:1 ordinary text / 3:1 large text. Keyboard testing found the inherited skip-link layer underneath navigation; the new focus layer corrected it, and the repeated focus-clearance check passed. These are targeted Chromium checks, not a complete accessibility certification.
- Strict standalone TypeScript, JavaScript generation, formatting and whitespace checks passed. Extension runtime and permissions are unchanged; extension tests were not rerun for this standalone site redesign.

## Full-width hero spotlight — 2026-10-12

- Moved the spotlight and its pointer events to a full-width outer hero section; the centered content remains in the existing `.hero.wrap` grid.
- Chromium verified tracking in the left margin, center and right margin, both mouse axes, pointer-exit reset, and no horizontal overflow at 320, 375, 414, 768, 960, 1440 and 1920px. Compared hero, copy and demo bounding boxes against the committed page at every width: positions and dimensions are unchanged.
- Desktop screenshots with the spotlight at both browser edges and a mobile screenshot were visually reviewed. Live reduced-motion changes clear and hide the spotlight; forced reduction and touch input leave it inactive.
- Mobile navigation and Escape dismissal, demo role filtering and fill preview, and the shared documentation script passed. No browser runtime errors observed. Checks used fictional demo metadata only.
- Strict standalone TypeScript, JavaScript regeneration, formatting and whitespace checks passed. The design detector reported existing page typography, spacing and style findings outside this refinement. Extension runtime is unchanged and extension tests were not rerun.

## Bubble typography and Hyperlane header — 2026-10-07

- Browser confirmed local Plus Jakarta Sans loaded for the homepage and documentation, with 700-weight headings. JetBrains Mono is packaged for numbered labels and code, with both font licenses included.
- Homepage checked at 320, 375, 414, 768, 960 and 1440px; documentation at 320, 375, 414 and 768px. No horizontal document overflow. Desktop and mobile screenshots visually inspected.
- Desktop navigation stays inline from 960px. The floating header enters its narrower 1000px state on scroll and stays 16px below the viewport top. Mobile menu opens and Escape dismisses it. Docs and home navigation work.
- Strict standalone TypeScript, generated JavaScript, formatting and whitespace checks passed. No browser console errors observed. Reduced-motion CSS disables header transitions; the previously verified mouse spotlight is unchanged.
- The original preview tab remained unresponsive, so verification used a fresh in-app browser tab. Temporary viewport sizing was reset and the new preview was retained.

## Mouse spotlight and desktop navigation refinement — 2026-10-07

- Chromium observed the green spotlight following both mouse axes, fading on pointer exit, and allowing the Member demo filter to remain clickable. Reduced-motion CSS immediately hides the layer.
- Isolated generated-script checks passed coordinate conversion, one-frame batching, preference-change cleanup, pending-frame cancellation, touch/coarse-pointer exclusion, and the forced reduced-motion guard. The initial browser assertion for preference cleanup read before its asynchronous media-query event; the cleanup handler was verified separately rather than claiming that timing assertion passed.
- In-app browser confirmed inline desktop links and hidden hamburger at 960, 1280, 1440 and 1920px; smaller navigation at 320, 375, 414 and 768px. No horizontal overflow at those observed sizes. At 375px, the menu opened and Escape dismissed it.
- Documentation uses the same visible desktop navigation; the Docs link navigated successfully. Desktop screenshot reviewed with the spotlight active.
- Strict TypeScript and formatting/whitespace checks passed. This refinement changes only the standalone product page.

# Product-page redesign verification — 2026-10-07

## Observed results

- Standalone `main.ts` strict TypeScript check: passed.
- Generated `main.js` with the repository’s esbuild: passed.
- Application tests scoped to `src`: **6 files, 92 tests passed**.
- Extension build (`npm run build`): passed.
- Whitespace/error check (`git diff --check`): passed.
- Local links and cross-page fragment targets: all resolve.

## Browser coverage

Chromium with fresh, isolated contexts and fictional demo accounts only:

- Widths **320, 375, 414, 768, 1280, 1440, 1920px**. No document overflow or visibly clipped page content across all five homepage scenes and the docs page with every disclosure expanded.
- Visually inspected the desktop hero and mobile demo at 320, 375, 414 and 768px. Corrected inherited extra mobile padding, narrow role filters and step-label clipping. Desktop primary CTA and demo fill action are visible at 1280×800.
- Role filter → one matching account; search → matching results; empty search result → explanatory text and disabled fill; selected name carries into the final fill illustration.
- First-use preview controls select the matching scene. `/` opens and focuses account search. Modal menu opens, Escape closes, and expanded state restores.
- Installation checklist reaches four completed steps and supports unchecking. Clipboard success copies the exact Chrome extensions address; a forced clipboard failure gives a manual-entry fallback.
- Documentation deep links open the target disclosure.
- No page JavaScript errors or external runtime requests observed.
- JavaScript disabled: original sample picker remains readable, numbered installation instructions remain, role filters stay hidden, and native details remain available.
- Normal motion: no autoplay on load. The 14-second opt-in tour reaches Fill and stops after one pass. Reduced motion: playback is hidden and manual scene changes are immediate. Fixed a paused-fade edge case found during visual review.
- Computed foreground/effective-background WCAG checks found no text contrast failures across all five scenes or expanded documentation (4.5:1 ordinary text; 3:1 large text). This is a targeted rendered-text check, not a complete assistive-technology certification.

## Repository test-run limitation

The unfiltered `npm run check` command passes project TypeScript, then collects tests from `.agents/skills` and `.claude/skills`. It fails on installed skill suites (including “No test suite found”), so its chained build step does not run. No test configuration was changed for this design task. Running the application tests with `rtk proxy node_modules/.bin/vitest run --root . src` passes all 92 tests; running `rtk npm run build` separately also passes.

## Scope

The existing `styles.css` is unchanged; the new `guide.css` layers the design over it. Its legacy literal colors and spacing are not claimed to be fully migrated to Hallmark tokens. No extension credentials, storage, permissions or behavior were modified. No real-world website autofill was performed by the synthetic product demo.

---

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

## Development login before-and-after scene

- Added an opening development login illustration with three animated notes showing the search for a test account. The final fill scene uses the same development-page frame. There are no editable credential fields or real sign-in actions in either illustration.
- The loop now contains five 2.5-second scenes (12.5 seconds total). Updated direct scene buttons, fill/back actions, slash-to-search, demo-link entry, and frozen timestamps for the new opening scene.
- Strict TypeScript and formatting checks passed; CSS parsed successfully. Local JSDOM simulation executed the generated script with animation/visibility APIs stubbed and checked the five-scene loop, pause, animation targets, search, account selection, fill-name transfer, keyboard focus, reduced motion, unique IDs, and frozen positions.
- Browser rendering was not repeated in this pass: the preview tool blocks local file navigation. Layout and actual animation timing need visual confirmation after a manual preview reload; simulated DOM checks do not establish visual correctness.

## Compact walkthrough

- Capped the walkthrough width at 460px, reduced scene headings to 24–28px, lowered minimum panel height, and tightened card, row, and frame spacing. Compacted the development form and repositioned its notes. Navigation controls retain a 44px minimum height and account rows retain 46px.
- Reduced travel distances, rotation, and scale effects while retaining the same five-scene loop and timing.
- Strict TypeScript, JavaScript generation, CSS syntax parsing, formatting, and whitespace checks passed. Browser visual verification remains unavailable under the local-file navigation restriction; the updated layout needs a manual preview review.
- Follow-up sizing adjustment: reduced maximum width to 420px, scene headings to 23–26px, and panel/header spacing again. CSS syntax, formatting, and whitespace checks passed; control sizes and animation behavior remain unchanged.

## Smaller panel and slower Before scene

- Reduced maximum width to 400px, scene headings to 22–24px, and panel padding/minimum height. Control target sizes remain unchanged.
- Before now lasts four seconds with more gradual detail motion. Other scenes remain at 2.5 seconds, for a 14-second loop. Frozen timestamps account for the differing scene durations.
- Strict TypeScript, generated JavaScript, CSS syntax, formatting, and whitespace checks passed. Local DOM simulation verified scene durations, loop wrap, and seek boundaries. Browser layout/timing verification remains subject to the local-file preview restriction noted above.
