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

The previous hero demonstrated account selection but skipped import and site authorization. The new four-stage walkthrough makes that setup visible before showing how selection leads to an explicit fill action. The final illustration states that the user submits the form.

The motion stays inside the hero and stops after one pass. Direct step navigation, playback controls, interaction-triggered pause, and reduced-motion behavior let visitors set their own pace. Browser review caught varying panel heights; inactive stages now reserve their space, so advancing the walkthrough does not move the surrounding page. The rest of the page remains immediately visible.
