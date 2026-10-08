## Bubble type and Hyperlane navigation — 2026-10-07

Applied the requested Plus Jakarta Sans heading/body family and JetBrains Mono numbered labels from Bubble. Replaced the straight desktop header with Hyperlane’s floating pill, centered links, rounded primary action, and compact scrolled state. Kept the cream/green palette, mouse spotlight, existing routes, and mobile menu. Fonts and licenses are local; reduced motion removes the header transition.

# Hallmark review and redesign — 2026-10-07

Pre-emit critique: Philosophy 4 · Hierarchy 4 · Execution 4 · Specificity 5 · Restraint 4 · Variety 4.

## Ranked findings and fixes

| Severity | Finding in the previous page | Location | Applied correction |
| --- | --- | --- | --- |
| Major | Compact, automatically looping walkthrough competed with the product definition and hands-on action. | `index.html` hero; `main.ts` playback | Start with the usable account picker. Make the tour optional and stop after one play. |
| Major | Uniform Geist display/body, cool indigo surfaces and floating navigation did not express the requested reference mix. | `styles.css`, `tokens.css` | Local upright Young Serif + Geist, warm cream/green tokens, edge-aligned header and mast-headed footer. |
| Major | Multiple decorative containment layers and imitation browser bars made the product harder to read. | Hero scenes and docs illustrations | Flatten scene framing; replace browser-like bars with plain site captions. Preserve the working demonstration. |
| Major | Installation was a wall of passive instructions. | `index.html#setup` | Optional progress checklist and working address-copy control with failure recovery. |
| Minor | Workflow explanation was disconnected from the demo. | `index.html#how-it-works` | Add direct scene preview buttons, carrying keyboard focus to the selected scene. |
| Minor | Some inherited hint, footer and documentation illustration text failed contrast after the palette change. | Shared guide styles | Apply semantic ink/muted tokens and verify rendered contrast. |

Initial ranked count: 0 critical · 4 major · 2 minor. These findings are remediated in this pass.

## Reference interpretation

- [Hollowback Apiary](https://www.usehallmark.com/examples/garden-01/): warm paper, green ink, upright Young Serif and generous editorial spacing.
- [Tally](https://www.usehallmark.com/examples/tally/): clear product explanation, readable demo and straightforward actions.
- [Hyperlane](https://www.usehallmark.com/examples/hyperlane/): the requested mouse-following hero spotlight, plus responsive controls and clear state feedback. The spotlight uses the green palette and respects reduced motion. No unrelated event countdown or RSVP flow was copied.

The page keeps its original routes and topic anchors. The extension itself is unchanged. `guide.css` is an additive visual layer; `styles.css` is preserved. The documentation content remains in its existing information architecture.

## Requested interaction and navigation refinement

Added the Hyperlane-style spotlight on mouse input. It sits behind hero content and cannot intercept controls. At 960px and above, both pages show the navigation links directly; the hamburger remains available below that breakpoint.

## Hallmark gate review

Reviewed the supplied 58-gate checklist against the resulting page. The current guide uses token-based colors, roman display headings, labeled controls, visible focus, reduced-motion support, local assets, no invented social proof, and no new browser chrome. Browser checks cover 320–1920px, all five tour scenes, expanded documentation, and functional interaction states.

This is an in-place redesign, not a claim that the preserved legacy stylesheet has been fully migrated: its historical literal colors, font declarations and spacing remain in source. A blanket “58/58” source-level certification would be inaccurate. The new visual layer centralizes its colors/fonts in `tokens.css`, while a future cleanup could consolidate the legacy cascade. Native checkbox styling remains browser-owned.

See `VERIFICATION.md` for the actual observed results and the unrelated default test-discovery failure.

---

<!-- Hallmark · pre-emit critique: P4 H4 E4 S5 R4 V3 -->

# Login Pal product-page audit

2026-10-07. Scope: improve the existing homepage and verify the shared styles on the documentation page. The user explicitly requested improvements in addition to an audit. Baseline locations below refer to the files before this pass.

## Ranked findings

| Severity | Tell / usability finding                                         | Baseline location                                | Correction                                                                                                                                                   |
| -------- | ---------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Major    | Generic promotional copy obscures the product                    | index.html:55–80                                 | State that Login Pal is a Chrome extension that turns synthetic-account CSVs into a searchable catalog, fills on request, and leaves submission to the user. |
| Major    | Decorative eyebrow on every section                              | index.html:55 and repeated section introductions | Remove homepage label pills; use descriptive headings for workflow, installation, permissions, and FAQ.                                                      |
| Major    | Undersized text weakens hierarchy                                | styles.css:343–512 and installation/body rules   | Increase instructions to 16px, supporting UI to 12–14px, and the demo action to a 44px minimum height.                                                       |
| Major    | Animate-on-scroll on everything                                  | main.ts:89 onward; styles.css:.reveal.pending    | Remove the intersection observer and keep content immediately visible, including without JavaScript.                                                         |
| Minor    | Every section padded the same; decoration competes with the demo | styles.css:86, 288; index.html:84 onward         | Tighten section spacing, remove hero orbits/glow, level the interactive picker, and move offline details after the first-use instructions.                   |

Baseline: **0 critical · 4 major · 1 minor** in this focused punch list. All five addressed.

## Review boundaries

This is not a claim of a complete 58-gate Hallmark certification. Existing documentation illustrations, secondary decorative feature artwork, and legacy raw color declarations remain. New improvement rules use the scoped tokens file; replacing every legacy token and illustration would be a broader visual-system migration. The original local Geist identity is retained intentionally.

Product copy retains existing compatibility details. Current synthetic-data and named-group amendments support the new introduction; Chrome's official unpacked-installation documentation was checked through Context7. No store listing, download link, installation-time estimate, testimonial, or performance metric was invented.

## Evidence

See VERIFICATION.md for observed browser checks. Screenshots contain fictional demo metadata only. No extension runtime code changed.

## Hero motion review — 2026-10-07

The previous hero demonstrated account selection but skipped import and site authorization. The walkthrough now opens with the problem: a development login page waiting for a test account while an old CSV, setup notes, and chat compete for attention. Import, authorization, and selection lead back to the same login page with illustrative fill indicators. The final illustration states that the user submits the form.

The motion stays inside the hero, looping at 2.5 seconds per step. Each panel animates the action it explains: importing rows, configuring fields, selecting an account, and filling fields. Direct step navigation, playback controls, interaction-triggered pause, and reduced-motion behavior let visitors set their own pace. Browser review caught varying panel heights; inactive stages now reserve their space, so advancing the walkthrough does not move the surrounding page. The rest of the page remains immediately visible.
