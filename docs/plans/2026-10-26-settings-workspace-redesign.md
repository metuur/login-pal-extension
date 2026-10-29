# Settings workspace redesign

The user supplied a reference design replacing the settings tab strip with a two-column
workspace: a persistent configuration rail on the left and a content card on the right.

## Layout decision

`#app` now holds the brand header plus a `.settings-shell` grid of
`minmax(0, 260px) minmax(0, 1fr)`, widened from 880px to 1180px. The left
`.settings-sidebar` carries the navigation rail, the local-storage meter and the reset
action; the right `.settings-main` owns the group picker, the status region, the
scrolling panel body and the footer.

The rail replaces the horizontal strip but keeps the same mechanics: `role="tablist"`
with `aria-orientation="vertical"`, `role="tab"` buttons with `aria-controls`,
`aria-selected` and roving `tabIndex`, and `role="tabpanel"` panels keeping the ids
`#import`, `#accounts` and `#profile` so existing deep links work. Arrow keys now move
along the rail in both axes (Up/Down as well as Left/Right) plus Home and End.

Tab order on the rail follows the reference — login page rules, accounts vault, import
dataset — but the default selection stays the import panel, because a first run still
has nothing to configure until a dataset is loaded.

Below 860px the shell collapses to one column with the rail above the card and laid out
horizontally; below 370px the rail rows stack full width.

## Naming

Tabs were renamed to the reference labels: `Import accounts` → `Import dataset`,
`Indexed accounts` → `Accounts vault`, `Login page setup` → `Login page rules`. The
visible label and the accessible name are identical; the trailing meta chip is
`aria-hidden`. `Use common selectors` became `Restore common defaults`. Background
guidance strings that told the user to "Open Login page setup" were updated to match, so
the instructions still name a tab that exists.

## Rail meta chips

Each rail row shows a trailing chip refreshed from `updateRailMeta()`: the saved/unsaved
state of the profile, the account count, and the detected file format. They report real
state rather than echoing the selection, which `aria-selected` already conveys.

## Storage meter

The footer's `Local: X MiB / 5 MiB limit` line moved into the sidebar as a labelled
`role="progressbar"` with a usage reading, a percentage and a caption stating that
accounts stay in this browser's local storage. The footer keeps the version line and
`Done`. The reset action moved to the sidebar so it is reachable from every tab; `Purge
group` stayed in the accounts panel, and both keep their confirmation dialogs.

## Panel composition

Panels gained a `.panel-header` (title, subtitle, and one `.accent-action` on the right),
bordered `.subpanel` boxes for login field selectors and application recognition, and a
`.panel-footer` action bar. The profile footer adds `Discard changes`, which re-populates
the form from the saved profile and nothing else.

## Import messaging

The import banners named neither the file nor the outcome, so every run read the same.
They now state what actually happened.

Verification reports the file by name with its valid count and the change summary, toned
by the result: success when every entry is valid, warning when some failed, error when
none are. The counts in the summary list only the ones that moved, so the line differs
per file instead of always printing seven zeros.

A completed import names the file, the group it landed in, the change summary, any
skipped entries, and the next step — which is the saved domain when a profile exists and
an instruction to save the login fields when it does not. A first import into a new group
has no saved rule yet, so that line falls back to the rule the review was checked
against.

Failures name the file that produced them: several can be tried in a row, and the reason
alone does not say which one failed. The size limit reports the actual size, the
unsupported-extension message reports the rejected name, and the missing-domain message
gives an example instead of saying "Enter the URL to match".

## Selected rail row

The selected row first carried an inset 3px left bar. An inset shadow follows the row's
10px radius, so it rendered as a stray crescent at the corners. The tinted pill, indigo
label and indigo icon carry the selection on their own, which is also what the supplied
reference shows.

## Not built

Three elements of the reference describe data this extension does not have, so they were
left out rather than faked:

- a "Last modified" timestamp — nothing on a stored profile records one;
- a live "2/2 Validated" chip and "Resolved: input#username" readouts — the settings page
  cannot resolve selectors against the target page;
- a "Live Active Tab Validator / Test Query" box — the existing detect-fields flow
  already reads a chosen tab, and a second entry point would need a new background
  command.

The selectors subpanel shows a static `Checked on save` hint instead of a validation
count.

## Unchanged

Every background command, validation path, permission gesture (still synchronous inside
its click handler), confirmation dialog, busy-state handling, import preview and commit
flow, undo window and credential boundary is untouched. No account password reaches a
view model.

## Validation on 2026-10-26

- TypeScript check, 136 unit tests, Prettier check and both production builds passed.
- 135 isolated Chromium acceptance checks passed, including tab roving focus, draft
  retention across tabs, import review/commit, profile save, delete/Undo, export, purge
  and reset.
- No horizontal overflow at 360, 430 and 1000px, with the rail still on screen.
- Desktop screenshots were inspected in the development preview at 1300px.
- Import messaging was exercised in the preview against a clean file, a file with some
  invalid rows, a file with no valid rows, an unparseable file and a missing domain;
  each banner named the file and carried the matching tone.
