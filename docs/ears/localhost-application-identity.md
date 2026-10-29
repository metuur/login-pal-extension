# Localhost Application Identity — EARS Specifications

## Unit 1: Configure title recognition

**Why:** Let a group identify its application when multiple apps share an authorized origin.

| ID | EARS statement |
| --- | --- |
| R-AI-1.1 | WHEN configuring an authorized origin for a group, THE SYSTEM SHALL let the user save a title rule with mode `contains` or `equals` and a non-empty title string. |
| R-AI-1.2 | THE SYSTEM SHALL default a new title rule to `contains`. |
| R-AI-1.3 | IF a group has multiple authorized origins, THE SYSTEM SHALL associate each title rule with exactly one of those origins. |
| R-AI-1.4 | IF a title rule has an unsupported mode, an empty value, or an origin outside the group's catalog, THE SYSTEM SHALL reject it and preserve the prior profile. |
| R-AI-1.5 | WHEN comparing a configured rule with a document title, THE SYSTEM SHALL trim both strings, normalize them with NFKC, compare case-insensitively, and apply literal substring matching for `contains` or literal equality for `equals`. |
| R-AI-1.6 | IF a stored profile has no title rule, THE SYSTEM SHALL load it as a valid legacy profile and keep its group manually selectable. |
| R-AI-1.7 | WHEN a title rule is removed, THE SYSTEM SHALL preserve the rest of the profile and require manual group selection for that origin. |
| R-AI-1.8 | WHEN a title rule is saved or changed, THE SYSTEM SHALL persist it with the owning group's profile using the existing encrypted storage flow. |

## Unit 2: Resolve the active application

**Why:** Select the appropriate account group when applications reuse a host and port.

| ID | EARS statement |
| --- | --- |
| R-AI-2.1 | WHEN resolving an active page, THE SYSTEM SHALL compare its current URL origin and current document title with rules for groups authorized at that origin. |
| R-AI-2.2 | WHEN exactly one group matches the active page, THE SYSTEM SHALL suggest that group while requiring an explicit Fill action before credential delivery. |
| R-AI-2.3 | IF no rule matches or multiple groups match, THE SYSTEM SHALL ask the user to choose a group before showing that page's normal group-scoped account list. |
| R-AI-2.4 | IF the active document has no usable title, THE SYSTEM SHALL treat it as unmatched and require a group choice for page-scoped browsing. |
| R-AI-2.5 | WHEN the user chooses a group, THE SYSTEM SHALL bind the choice to the current tab and document. |
| R-AI-2.6 | WHEN a tab's URL or title changes, THE SYSTEM SHALL re-resolve the group; IF the selected group is no longer the unique match, THE SYSTEM SHALL discard the choice and ask the user to choose again. |
| R-AI-2.7 | WHEN a tab navigates to a new document or reloads, THE SYSTEM SHALL discard the prior document's manual group choice before any credential delivery. |
| R-AI-2.8 | THE SYSTEM SHALL treat title matches and manual choices as group-selection signals only; they SHALL NOT grant host permission or bypass catalog-origin, profile-origin, document, or field validation. |

## Unit 3: Search accounts across groups

**Why:** Find the intended account even when its group is not currently selected.

| ID | EARS statement |
| --- | --- |
| R-AI-3.1 | WHILE account search is available under existing vault/session rules, THE SYSTEM SHALL search account IDs, usernames, metadata names and values, group names, profile names, authorized origins, and configured title-rule text across all CSV groups. |
| R-AI-3.2 | THE SYSTEM SHALL apply NFKC-normalized, case-insensitive substring matching and require every whitespace-separated query term to match at least one searchable field. |
| R-AI-3.3 | THE SYSTEM SHALL exclude passwords from search fields, results, snippets, ordering, diagnostics, and persistent plaintext indexes. |
| R-AI-3.4 | WHEN showing all-group results, THE SYSTEM SHALL show each result's owning group name and preserve its stable group ID through account details and Fill actions, including when group names or account IDs are duplicated. |
| R-AI-3.5 | WHEN an all-group search result is selected while the active app is unresolved, THE SYSTEM SHALL use the result's owning group as the explicit group choice for that action, subject to all existing Fill checks. |
| R-AI-3.6 | WHEN the user clears a non-empty query, THE SYSTEM SHALL return to the currently selected group's normal account view. |
| R-AI-3.7 | THE SYSTEM SHALL paginate all-group search results at 50 records and order them stably by group name, group ID, and account ID. |
| R-AI-3.8 | THE SYSTEM SHALL meet the existing 200 ms search target for the 10,000-account acceptance dataset and record the measured machine and query-to-render timing while the vault is unlocked. |

## Unit 4: Show title information in Account details

**Why:** Make the recognition rule understandable without adding title details to account rows.

| ID | EARS statement |
| --- | --- |
| R-AI-4.1 | WHEN the user opens **Account details**, THE SYSTEM SHALL show the owning group's rule for the active origin, the current document title when available, and whether the rule matched. |
| R-AI-4.2 | THE SYSTEM SHALL display observed title and title-match information only inside **Account details**, not in collapsed account rows, search previews, badges, headers, or popup banners. |
| R-AI-4.3 | THE SYSTEM SHALL provide title-rule configuration controls in profile settings. |
| R-AI-4.4 | IF no active tab or readable title is available, THE SYSTEM SHALL show an unavailable state inside **Account details** and SHALL NOT treat the page as matched. |
| R-AI-4.5 | THE SYSTEM SHALL render observed and configured title strings as inert text and never interpret them as markup. |

## Unit 5: Preserve explicit safe filling

**Why:** Use group recognition without weakening credential-delivery safeguards.

| ID | EARS statement |
| --- | --- |
| R-AI-5.1 | WHEN a user activates Fill from an account result, THE SYSTEM SHALL re-read the current tab URL, document identity, and title before credential delivery. |
| R-AI-5.2 | IF the result's group is no longer the current unique title match and no current-document group choice exists, THE SYSTEM SHALL withhold credentials and request group selection. |
| R-AI-5.3 | WHEN credentials are delivered, THE SYSTEM SHALL retain existing permission, catalog-rule, profile, top-frame, unique-field, and document checks. |
| R-AI-5.4 | THE SYSTEM SHALL treat title text as page-controlled data that cannot authorize access to another group's credentials or broaden origin permissions. |
| R-AI-5.5 | THE SYSTEM SHALL never submit a form or activate a page's Login control as part of recognition or filling. |
