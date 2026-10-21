# Localhost Application Identity — Tasks

## Configure title recognition

- [x] 1.1 Save and validate per-origin title rules (est: ~60m) (mutex: profile-schema)
  - why: Let each application group identify itself on a shared origin while keeping existing profiles usable.
  - acceptance: R-AI-1.1–R-AI-1.8 — Support optional per-origin `contains`/`equals` rules, the `contains` default, literal NFKC/case-insensitive matching, validation, encrypted persistence, rule removal, and backward-compatible profiles without a rule.
  - verify: Exercise profile editor save/remove, malformed modes/values/origins, duplicate normalized titles, encrypted persistence, and load/save of a legacy profile without title data.
  - landed: ac28f24 — src/shared/types.ts, src/domain/rules.ts, src/domain/domain.test.ts, src/background/service.ts, src/background/service.test.ts, src/options/index.ts, public/ui.css

## Resolve the active application

- [ ] 2.1 Resolve a group from the current tab (deps: 1.1, est: ~70m) (mutex: group-resolution)
  - why: Distinguish local apps sharing an origin and avoid carrying a stale app choice to another document.
  - acceptance: R-AI-2.1–R-AI-2.8 — A unique title match suggests its group; missing or ambiguous matches request a choice for page-scoped browsing; bind manual choices to tab/document; re-resolve URL/title changes; discard choices on document navigation/reload; title evidence never grants authorization.
  - verify: Cover unique, missing, empty, and duplicate titles; same-origin groups; title/URL changes in one document; reload and cross-document navigation; inaccessible tab metadata; and unchanged permissions after title spoofing.
  - landed:

## Search accounts across groups

- [ ] 3.1 Search all groups with stable result context (deps: 2.1, est: ~80m) (mutex: group-search-api)
  - why: Help users find accounts by application identity even when they have not selected the matching group first.
  - acceptance: R-AI-3.1–R-AI-3.8 — Search account fields and saved group/profile/origin/title-rule fields across groups; preserve normalization, multi-term, pagination, ordering and password exclusion; label and retain group identity; support explicit all-group results while the page app is unresolved; return to the selected group when search clears; retain the 200 ms target and report measurements.
  - verify: Search duplicate account IDs and group names across groups; match configured title text; assert result group context survives details and Fill; ensure passwords never match or appear; confirm locked/unavailable behavior; measure query-to-render for 10,000 accounts while unlocked.
  - landed:

## Show title information in Account details

- [ ] 4.1 Configure and disclose title matching in the right views (deps: 1.1, 2.1, 3.1, est: ~55m) (mutex: account-ui)
  - why: Make the active app match understandable and editable while keeping account rows uncluttered.
  - acceptance: R-AI-4.1–R-AI-4.5 — Show current title, owning group's per-origin rule, and match state only inside Account details; keep configuration controls in profile settings; provide an unavailable state and render title text inertly.
  - verify: Inspect popup and settings Account details in matched, unmatched, and no-readable-title cases; confirm rows, previews, badges, headers, and banners do not show title-match data; verify title markup renders as plain text and settings can save/remove rules.
  - landed:

## Preserve explicit safe filling

- [ ] 5.1 Revalidate group context before credential delivery (deps: 2.1, 3.1, 4.1, est: ~60m) (mutex: fill-protocol)
  - why: Ensure search and title selection never bypass the existing credential-delivery boundary.
  - acceptance: R-AI-5.1–R-AI-5.5 — Re-read current URL, title and document before Fill; require current group context when recognition changes; preserve permission/catalog/profile/top-frame/unique-field/document checks; title text cannot broaden access; never submit the form.
  - verify: Race title changes, URL changes and navigation against Fill; try a search result from another same-origin group; assert credentials are withheld until the result's group is explicitly selected and all existing validations pass; assert successful Fill does not submit Login.
  - landed:
