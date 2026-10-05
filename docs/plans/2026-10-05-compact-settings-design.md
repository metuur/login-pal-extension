# Compact account settings

The user requested shorter, easier-to-navigate settings, with separate inner tabs for indexed accounts and website profile settings.

## Layout decision

Use three tabs: Import CSV, Indexed accounts, and Login profile. Keep the CSV group picker, tabs, and storage footer outside the scrolling content. The profile panel retains its full “Login profile & website permission” heading. Keep mounted panels so switching tabs preserves draft fields, selected files, and valid import reviews.

Simply reducing spacing would still leave three independent workflows stacked together. Collapsible sections would still allow the page to grow indefinitely. Tabs make the current task explicit and keep navigation available.

Settings can use up to 760px on desktop, including the local development preview. Profile fields use two columns when there is room; narrow screens use one column. The account-search popup keeps its existing width.

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
