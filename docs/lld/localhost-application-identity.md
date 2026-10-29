# Localhost Application Identity — Low-Level Design

## Architecture

Each CSV group remains the application boundary and keeps its existing encrypted catalog and one login profile. Add an optional title-recognition rule per authorized origin to the profile. A rule consists of `contains` or `equals` and a configured title string. Legacy profiles without rules remain valid and use manual group selection.

When resolving an active page, the background compares its current URL origin and current document title against rules for groups authorized at that origin. A unique match suggests a group. Missing or duplicate matches require the user to choose before the page-scoped account list is shown. Title evidence is a selection hint only; it does not grant permissions or authorize credential delivery.

A non-empty search spans all groups while the vault is available. Search fields include account ID, username, metadata names and values, group name, profile name, authorized origin, and configured title-rule text. Passwords are excluded. Every result carries its group ID and display name; account details and Fill actions retain that group context. Group names need not be unique, so result identity uses the stable group ID as well as the display name.

If the tab or its title cannot be read, the popup treats identity as unavailable and withholds normal page-scoped accounts until the user chooses a group. With a configured rule but no match, Account details distinguishes an unresolved choice from a manual selection; a manually selected group still reports that the title did not match.

The popup's existing **Account details** disclosure shows the result's owning group, the current page title when available, that group's configured title mode and text for the current origin, and the match status. The settings profile editor exposes the controls needed to configure and edit title rules; the display-only restriction applies to observed/match information in account views.

The background re-resolves the group when a tab's URL or title changes and immediately before Fill. A manual choice is bound to the current tab and document. Navigation to a new document discards that choice; a same-document title or URL change triggers re-resolution, and a choice remains valid only while the same group is still the unique match. A search result may explicitly select its owning group for that action. Fill still rechecks current origin, catalog rule, permission, profile, document identity, and fields before sending credentials.

Search preserves NFKC normalization, case-insensitive substring matching, whitespace-separated AND terms, 50-result pagination, and password exclusion. Search order is stable by group display name, group ID, then account ID. A non-empty query searches across groups; clearing it returns to the currently selected group's normal account view.

## Constraints

- Manifest V3, strict TypeScript, packaged local assets, background-owned state, and existing per-group encrypted storage.
- Title values are page-controlled, untrusted text. Render as text, never as HTML.
- Do not add broad tab access or inspect unrelated pages. Read title information only for the active page under existing tab/host access.
- Global search is available only while existing vault/session rules permit account access.
- Passwords must never enter search fields, results, snippets, ordering, diagnostics, or a persistent plaintext index.
- Preserve explicit credential delivery, current document targeting, and no-auto-submit behavior.
- Keep the existing 200 ms target for the 10,000-account search acceptance dataset; benchmark all-group search while unlocked and record the machine and timing boundary.

## Key Decisions

- Use the current document's HTML title, not a favicon, input labels, or an app-marker convention.
- Default to **Title contains**; provide **Title equals**. Trim both values, normalize with NFKC, and compare case-insensitively. Matching is literal substring/equality, with no wildcard or regular-expression interpretation.
- Configure rules per origin so local and hosted environments can use different titles.
- Search every group for non-empty queries and label results with group identity. Do not merge duplicate account IDs across groups.
- Missing or ambiguous title evidence requires a group choice for page-scoped browsing. An explicit all-groups search may show labeled, password-free results while the app is unresolved; choosing a result supplies its group context, and Fill remains explicit.
- Title matching is not a security boundary. Same-origin apps share origin-level browser permission; actual isolation requires distinct origins or another trusted boundary.
- A page controls its own `<title>`, so a page can spoof another application's label. Treat the result only as a selection hint and keep Fill tied to the current tab, document, origin, profile, catalog and permission checks. Same-origin applications cannot be isolated by this feature.
- Ambiguous or absent title rules can block normal account browsing until the user chooses a group. Keep the all-groups search explicit, password-free and group-labeled so users can recover without silently choosing the wrong account boundary.
- Existing profiles without title rules load unchanged and remain manually selectable. Removing a rule returns that origin to manual selection.
- Show observed title, configured rule, and match status only in **Account details**. Configuration fields remain in profile settings.

## Out of Scope

Process/backend detection; app-controlled identity tokens; fuzzy title inference; automatic profile switching without a unique match; searches over passwords; automatic credential filling or form submission; same-origin application security isolation.

## Verification Evidence

The local Playwright acceptance harness passed 131 checks. Its 10,000-account input-to-render search measurement was 174.5 ms (200 ms target) on Chromium 153.0.8010.12, macOS arm64, Apple M3 Max. The harness uses synthetic account data and a disposable HTTPS localhost fixture; the target production application is not configured.
