# Compact account settings

The user requested shorter, easier-to-navigate settings, with separate inner tabs for indexed accounts and website profile settings.

## Layout decision

Use three tabs: Import CSV, Indexed accounts, and Login page setup. Keep the CSV group picker, tabs, and storage footer outside the scrolling content. The profile panel uses the matching “Login page setup” heading. Keep mounted panels so switching tabs preserves draft fields, selected files, and valid import reviews.

Simply reducing spacing would still leave three independent workflows stacked together. Collapsible sections would still allow the page to grow indefinitely. Tabs make the current task explicit and keep navigation available.

Settings retains a compact 430px maximum width. In the local development preview, settings and the main account-search page share that same container width, so navigation does not resize the app. This follows the user's width correction after reviewing the initial tabbed layout. Profile fields stack within the compact container. The account-search popup keeps its existing width.

## Import and help

The first import step contains the group, file, domain, and import mode. Verification replaces those controls with a compact review containing the file, group, authorized rule, mode, all seven counts, and safe row diagnostics. Edit and Cancel return to the retained setup. Catalog changes invalidate the review as before. Successful imports open the profile tab and suggest the imported domain when that field is empty.

Domain explanations, field-matching instructions, and local-data/reset details remain available through expandable help. Import-mode consequences remain visible. Existing background commands, permission gestures, destructive confirmations, and credential boundaries remain unchanged.

## Accessibility and validation

Tabs use associated tab/tabpanel roles, selected state, and roving focus. Arrow keys, Home, and End switch tabs; hidden panels leave the accessibility tree and tab order. Verification moves focus into the review. Existing #profile links select the correct panel.

Observed validation on 2026-10-05:

- TypeScript check and 71 unit tests passed.
- Extension and development-preview production builds passed.
- 77 isolated Chromium acceptance checks passed, including draft retention, review/edit/cancel, stale-review invalidation, imports, website profiles, delete/Undo, export, and purge.
- All three panels had no horizontal overflow at viewport widths of 360, 430, and 1000px. Desktop and narrow preview screenshots were inspected; import setup fit a 390 × 844 preview without scrolling.
- Browser tests used synthetic accounts and a disposable extension profile. The host permission prompt was bypassed only in the disposable test copy; real website compatibility was outside this layout change.

Generated screenshots are in the ignored artifacts directory: settings-import.png, settings-review.png, settings.png, settings-profile.png, and settings-import-narrow.png.

## Default login field selectors

At the user's request, new profiles now prefill real CSS values: username autocomplete, email inputs, and common username/email/login names or IDs; password inputs use `input[type="password"]`. Saved custom values and matching methods remain intact. “Use common selectors” explicitly restores both CSS drafts; it does not save the profile or grant permission. The profile includes a plain-language explanation of website authorization, field matching, and success detection.

The existing exact-one-input, visible/writable, authorized-origin, and manual-submit checks remain unchanged. Broad defaults may require narrowing on pages with multiple matching forms. Validation passed 71 unit tests, 80 Chromium checks, and both builds, including saving and filling with the prefilled selectors. The isolated preview was visually inspected at the shared 430px width.
