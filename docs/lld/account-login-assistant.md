# Account Login Assistant — Low-Level Design

## Synthetic-data mode — supersedes password-lock requirements (2026-10-05)

The user removed the lock feature for synthetic-only data. New installations create a ready-to-use local catalog automatically. No setup password, lock button, idle timer, TOUCH renewal, startup lock, or alarms permission remains. The snapshot retains AES-GCM but persists its key in trusted local storage; this does not provide user-password protection. Existing encrypted catalogs migrate once with their old key/session or previous password, preserving data on failure. Reset clears old state and creates an empty ready catalog. Origin authorization, explicit filling, password-free summaries, transactional imports, and attempt/Undo expiry remain. Historical locked-state instructions below are superseded by this amendment.


Status: Implemented under the user-authorized build. See the task plan and verification report for landing evidence and integration limits. Upstream: [HLD](../hld/account-login-assistant.md). Behavior contract: [EARS](../ears/account-login-assistant.md).

## Architecture

Use Manifest V3, strict TypeScript, ordinary accessible HTML/CSS, bundled local JavaScript, and the browser Web Crypto API. The popup is optimized for account use; the options page owns setup, profile configuration, import, and reset. A background service worker is the only authority for vault mutations and credential delivery. No remote runtime assets or network service are needed.

### Components and proposed boundaries

| Component | Responsibility | Input / output |
| --- | --- | --- |
| CSV importer | Parse UTF-8 CSV and validate schema/rows | File bytes → valid accounts, counts, safe row diagnostics |
| Vault repository | Encryption, atomic snapshot persistence, serialized writes, revision checks | Typed commands → encrypted persistent envelope |
| Search | Build an index while unlocked; search non-secret fields | Normalized terms → paginated account summaries |
| Profile policy | Validate URL routes, CSS selectors, permissions, and profile version | Configuration/current URL → allow or reject |
| Autofill content script | Check the current document and both inputs; fill on worker instruction | One account credential pair → safe acknowledgement |
| Attempt tracker | Correlate fill acknowledgements and observed success transitions | Tab/document/profile/account references → history update |
| Popup | Locked/disallowed/loading/empty/search/selected/filled/error states | Safe summaries and explicit user actions |
| Options page | Vault setup/unlock, CSV preview and import modes, account delete/Undo/purge, one profile editor, reset | Validated user commands |

Suggested source layout for the later implementation: `src/background/`, `src/domain/`, `src/content/`, `src/popup/`, `src/options/`, `src/shared/`; unit tests beside domain code and browser fixtures in `tests/fixtures/`. The build emits a self-contained unpacked extension directory. Tool versions and build commands are pinned and documented during implementation.

### Data contracts

```ts
type Account = {
  accountId: string;
  username: string;
  password: string;
  metadata: Record<string, string>;
};
type Route = { origin: string; pathname: string; hash: string };
type CatalogRule = {
  origin: string;
  pathname: string;
  pathMatch: "exact" | "prefix";
  hash: string;
};
type LoginProfile = {
  id: string;
  revision: number;
  approvedCatalogRuleRevision: number;
  name: string;
  login: Route;
  usernameSelector: string;
  passwordSelector: string;
  success:
    | { kind: "url"; route: Route }
    | { kind: "element"; route: Route; selector: string };
};
type ProfileHistory = {
  lastSuccessfulAccountId: string | null;
  lastSuccessfulAt: number | null;
  recentAccountIds: string[];
};
type VaultPayload = {
  schemaVersion: 1;
  revision: number;
  snapshotRevision: number;
  catalogRule: CatalogRule | null;
  catalogRuleRevision: number;
  accounts: Account[];
  history: Record<string, ProfileHistory>;
};
```

The encrypted envelope contains only a format version, KDF identifier and parameters, random salt, random IV, and ciphertext. Its authenticated metadata binds the format version and KDF configuration. Profile configuration can persist unencrypted because it contains no account credentials; history stays inside the vault. The master password is never stored.

An attempt contains a random token, tab ID, originating document ID, profile ID/revision, vault revision, account ID, creation/expiry timestamps, and baseline success state. It contains no password or username. Only one attempt is current per tab. `revision` is the catalog revision and increments on account/rule mutations; `snapshotRevision` increments on every persistent vault write, including history changes. All persistent writes run through one worker queue and recheck session/profile/catalog revisions immediately before commit, using the latest snapshot. Import previews and Undo additionally require an unchanged snapshot revision. This permits independent valid login attempts in different tabs without allowing stale import/Undo snapshots to overwrite newer history.

### Vault lifecycle

1. Setup requires a confirmed master password of at least 12 characters. Explain no recovery before creation. Do not trim or normalize the password.
2. Derive a 256-bit AES-GCM key with PBKDF2-HMAC-SHA-256, an independently generated 16-byte salt, and 600,000 iterations. Use a new cryptographically random 12-byte IV for every encryption. The AES-GCM authentication tag is 128 bits. Authenticate the versioned envelope metadata.
3. Persist the encrypted envelope in `chrome.storage.local`; never put plaintext account data in localStorage, IndexedDB, sync storage, logs, or durable caches. Restrict local and session storage to trusted extension contexts before processing requests.
4. Retain the derived key only in trusted `chrome.storage.session` while unlocked so worker suspension does not force a new unlock. Decrypted account/index caches exist only in worker memory. Session storage does not defend against a compromised browser; this is local encryption at rest.
5. Use `chrome.alarms` for a best-effort idle lock after 15 minutes. Independently check an absolute expiry before every privileged operation so delayed alarms never grant extra access. Only explicit extension interaction extends inactivity; website events do not. Packaged pages send a throttled TOUCH on trusted pointer, keyboard, or input events while unlocked; state polling never renews expiry. Alarm callbacks check the current deadline so an old queued alarm cannot lock a renewed session.
6. Manual lock, expiry, disable, reload, update, and browser restart end the unlocked session. Invalidate an unlock-generation token; clear key, caches, pending imports, encrypted undo records, and attempts. In-flight operations must not restore old state or complete a history/import write after locking.
7. A wrong password, malformed envelope, failed authentication tag, or unsupported version shows a generic safe error and preserves storage. Reset requires a separate destructive confirmation and clears vault, profile, permissions, dynamic registrations, and session state.

### CSV import, merge, and replacement

The import flow has two stages. Step 1 selects/changes a CSV, requires a **Target authorized URL pattern**, and chooses Merge & Update (default) or Wipe & Replace. Step 2 reviews normalized target, file size, found/valid/invalid rows, and added/updated/removed/unchanged counts, then explicitly confirms the selected operation. The Step 1 action validates/previews; it does not commit. Use “Verify accounts” before counts are known and “Import N valid accounts” on the final confirmation. Changing file, rule, mode, or underlying vault revision invalidates the preview.

Require the target on every import and prefill the current catalog rule when available. Store the normalized `catalogRule` and its revision inside the encrypted vault snapshot with the accounts. A newly created empty vault has a null rule; a populated catalog must have one. Accept exact HTTPS URLs or a single terminal `*` in the pathname: `https://qa.example.com/*` and `https://qa.example.com/login*` are valid. Parse scheme and origin with the URL parser and compare origins exactly, including effective ports; never use a whole-URL substring or regex match. Reject userinfo, wildcard schemes/hosts/ports/hashes, embedded or repeated path stars, regex syntax, and non-HTTPS schemes. For prefix rules, remove the terminal star and compare the parsed pathname prefix; for exact rules compare the whole pathname. Match hashes exactly, including empty hashes. Ignore query parameters and show the normalized query-free rule in the preview. Reject a star in a query rather than silently discarding it. An encoded `%2A` remains literal and never becomes a wildcard. Use parsed normalized paths consistently for both configuration and observed URLs.

The catalog still has one rule and one exact login profile; per-row metadata never grants permission. Keep a profile's approved catalog-rule revision. A changed rule increments `catalogRuleRevision`, clears history, and requires the user to review and save the exact login URL, selectors, and success configuration before filling resumes, even if the old login URL falls within the new rule. An unchanged rule preserves approval. A first import or changed-rule replacement may complete without a profile; show “Configure login fields for this URL.” Import and shortcut selection do not grant host permission. A saved profile's exact login URL must satisfy the catalog rule; the success URL remains an explicitly configured same-origin observation route and need not match the login path pattern. The rule alone never permits arbitrary-page form inspection or filling.

Support UTF-8 with optional BOM, commas, CRLF/LF line endings, quoted delimiters/newlines, and escaped double quotes. Use a maintained CSV parser selected and pinned during implementation; no naive delimiter splitting. Reject malformed quoting, invalid UTF-8, empty or duplicate normalized header names, missing required headers, and limit violations before any write. Normalize header names by trimming and lowercasing; required names are exactly `account_id`, `username`, and `password` after normalization.

Count each nonblank logical record after the header as a row. Diagnostic row numbers refer to logical records with the header at 1. Ignore entirely blank records. A row is invalid if its field count differs from the header, account ID/username is empty after trimming, or password is empty. Preserve password bytes as decoded text, including leading/trailing whitespace; never trim it. Treat account IDs as case-sensitive identifiers. Mark every occurrence of a duplicated normalized account ID invalid to avoid choosing a credential arbitrarily.

Retain all metadata values as text and render them only as text. The preview shows found/valid/invalid counts and safe diagnostics such as `DUPLICATE_ACCOUNT_ID`; it never includes raw row contents. Zero valid rows or structural errors block either import mode. Invalid incoming rows never overwrite valid existing accounts.

Merge & Update uses account_id as the case-sensitive primary key: add absent IDs, replace the entire record (username, password, and complete metadata map) for existing IDs, and preserve records absent from the incoming valid rows. Mark identical incoming records unchanged; do not count them as updates. A populated catalog can merge only with the same normalized rule, otherwise require an explicit switch to Replace without mutating the old catalog. A new or empty catalog may adopt a rule on merge. Wipe & Replace retains only incoming valid records and previews how many current IDs disappear. Invalid-row exclusion and resulting removals must be visible before confirmation. Confirmation is bound to the parsed data, normalized rule, mode, and vault revision, not recalculated from mutable controls at commit time.

Enforce 2 MiB raw file size, 10,000 incoming data rows, 100 incoming columns, 10,000 accounts in the resulting catalog, and a 5 MiB serialized encrypted envelope. Measure final merged storage before writing. A failed encryption, quota error, cancellation, lock, or stale revision preserves the old snapshot. On any successful import, invalidate pending attempts and Undo, increment vault revision, and prune history for missing IDs. Changed credentials for an existing ID clear its last-successful reference/timestamp so new credentials are not represented as proven; recent selection references may remain. If the rule changes, clear all history and profile approval. One local-storage key replacement commits accounts, rule, rule revision, and history together.

### Account management mutations

Use the same worker-authorized serialized write path for import, delete, Undo, purge, and history. Every command validates unlocked-session generation and the expected vault revision. Changes notify open extension views so list results, imported counts, timestamps, and usage refresh from committed data. No DOM removal or optimistic completion counts as a successful operation. Any account mutation cancels pending login attempts; stale import previews require regeneration.

Individual Delete identifies a record by account_id from an accessible row action. Commit an encrypted snapshot without that account and prune its history; only then show “Deleted [account ID]” and Undo. Keep one Undo opportunity for 30 seconds. Its tombstone holds the deleted account encrypted with a fresh AES-GCM IV and purpose-bound authenticated data, plus the expected post-delete snapshot revision, session generation, target rule, and expiry. Store only that ciphertext/metadata in trusted session storage; no deleted plaintext is persisted. If tombstone preparation fails, leave the account untouched. A worker crash between delete commit and publishing the Undo token may leave deletion complete without Undo; report current state and never invent a restorable token.

Undo requires an unlocked matching generation, unexpired token, identical rule, unchanged post-delete snapshot revision, and an absent account ID. Restore only the deleted account in an atomic encrypted snapshot, then consume the token. Do not restore old successful-login or recent history. A new vault write, second deletion, import, purge, profile edit, lock, or expiry invalidates Undo; remove the action with an explicit “Undo no longer available” status if it was visible. Failed restore leaves the deleted state intact and offers retry only while the same conditions still hold.

Purge All shows a confirmation with the actual entire-catalog count, even when the list is filtered. Cancel does nothing. On confirmation, atomically empty accounts/history, clear Undo and attempts, and update count/search/usage. Preserve the initialized vault, current catalog rule, and configured profile so a later import is easy; do not recreate deleted accounts on unlock. Purge has no Undo, and the confirmation states this. Full reset remains a separate operation that removes setup and permissions. Purge and Delete are disabled while locked or a conflicting mutation is committing. Zero-account purge is disabled.

### Search and display

Index account ID, username, metadata names, and metadata values; exclude password from index, summaries, sorting, snippets, diagnostics, and clipboard actions. This exclusion is part of the planning baseline. Apply Unicode NFKC normalization and lowercase to search material only; tokenize trimmed queries on whitespace. Every token must match a substring somewhere in the indexed fields, so `premium acme` matches fields independently. Use stable account-ID order, display 50 results per page, and show a total matching count. Empty search lists accounts; recent accounts are a separate section.

Summaries include ID, username, and a compact set of metadata with an expandable full metadata view. Prefer `customer_name` as display title when present, otherwise account ID. Treat metadata as untrusted text. Keyboard users can navigate, select, confirm, and activate buttons; loading, empty, locked, unsupported-site, and error messages are explicit.

### Popup visual contract

Source references supplied by the user:

- `/Users/javierbenavides/Downloads/stitch_account_login_assistant_extension/screen.png`: visual composition and styling target.
- `/Users/javierbenavides/Downloads/stitch_account_login_assistant_extension/code.html`: concrete light-theme tokens, spacing, typography, and component reference; demo script behavior is not production logic.
- `/Users/javierbenavides/Downloads/stitch_account_login_assistant_extension/DESIGN.md`: general rounded, dense interface guidance; its dark theme conflicts with the image/HTML and is superseded for this popup.

Implement local CSS and packaged icons/fonts; do not execute or ship the reference's CDN Tailwind script, Google Fonts requests, inline demo JavaScript, or artificial delays. If the reference is copied into the repository during implementation, preserve it as inert design material, outside the extension's distributable output.

| Token | Value / usage |
| --- | --- |
| Popup surface | `#f8fafc`; white header, cards, and footer |
| Subtle surface | `#f1f5f9` for credential rows, icon buttons, and neutral chips |
| Borders | `#e2e8f0` subtle; `#cbd5e1` input outlines |
| Text | `#0f172a` primary; `#64748b` secondary; never low-contrast text for essential data |
| Primary | `#4f46e5`, hover `#4338ca`, with white text |
| Accent surfaces | `#eef2ff` / `#e0e7ff`, border `#c7d2fe` |
| Status | Pale emerald surface, emerald border/text, plus explicit Authorized text |
| Type | Locally bundled Geist for body/title and JetBrains Mono for IDs/labels; system sans/monospace fallbacks |
| Type sizes | Body 13px/18px, title 14px/20px semibold, supporting text 12px/16px, compact labels 10–11px/12–14px |
| Spacing | 4, 6, 8, 12, and 16px; 12px main inset |
| Radius | 4px small badges, 8px controls, 12px account cards, pill status |
| Depth | Thin borders and subtle shadows; avoid heavy elevation |

Target a 380px-wide popup with a viewport capped at 600px high and a vertically scrollable content area. Keep the footer reachable without horizontal scrolling; verify the layout at 360px and 420px widths and increased text size. Do not copy the reference's 884px body minimum, centered presentation canvas, blanket text-selection suppression, zoom disabling, or globally hidden scrollbars. Preserve visible keyboard focus, accessible names, text truncation with access to full account details, and reduced-motion preferences. Decorative icons may be 16px but icon-button hit areas must be at least 28px.

Component mapping:

1. Header: indigo key tile, “OneChat DEV Login Assistant,” open-management-page action, and Settings. Both management/settings actions open the existing options page, with the relevant section selected; no additional standalone catalog feature is implied.
2. Profile strip: configured name and domain, with Authorized shown only when the active tab matches the login policy and permission is granted. Locked status remains separately explicit; disallowed pages never appear ready to fill.
3. Featured card: “Last successful account,” actual company/ID/username, optional account-type/environment chips, indigo Autofill button, and the real successful-login timestamp when available. Persist `lastSuccessfulAt` with its account reference only on confirmed success; clear both when the reference is removed. Never invent a timestamp. With no successful history, show a compact empty state.
4. Search: magnifier, editable query, clear button, and `/` focus hint. `/` focuses search only while unlocked, without modifiers, and when focus is outside any editable control. Suggestion chips, if displayed, derive from imported non-secret metadata and set the query; omit them when there is no useful data.
5. List: compact white rows with initials, account title, metadata badges, account ID, and username. Use separate Recent accounts and Search results labels rather than conflating their meanings. Count badges describe real matches/recents, never an invented “active” status. Row actions open the account-confirmation view; use Select rather than the mockup's immediate Fill action. The featured-card action retains the specified direct-fill path.
6. Footer: real imported-account count and Lock action. Count is hidden while locked. A completed lock state appears only after actual session invalidation; a fill acknowledgement uses “Fields filled — click Login on the website,” never a claim of successful authentication.

The username-copy icon may be omitted from the MVP; never include an inert icon or introduce clipboard permission merely to reproduce it. Omit the mockup's `⌘+Shift+A` badge because no global autofill shortcut is specified. All sample records and decorative counts in the reference are illustrative only. Selected-account confirmation and all missing states use the same tokens and hierarchy. Visually compare the implemented popup against screen.png using synthetic matching content, then verify real empty/error/long-content states separately.

### Settings visual contract and actions

Use `/Users/javierbenavides/Downloads/stitch_account_login_assistant_extension-2/screen.png` and its sibling `code.html` as the settings layout/component references, with the same light-theme precedence over the sibling DESIGN.md. Treat supplied HTML as inert reference material; implement real typed event handlers and worker commands. Retain shared slate/white/indigo tokens, locally packaged Inter typography for this view, monospace labels/IDs, 12–16px rounded panels, compact badges, and the green local-encryption notice. Use one consistent “OneChat DEV Login Assistant” product name across views.

The options page has a compact settings column inspired by the 390px reference, fits narrow windows without horizontal scrolling, and uses ordinary page scrolling in a full Chrome tab. It must not depend on the screenshot's 884px canvas or suppress zoom/scrollbars. Setup/unlock and the one-profile editor remain available on this page even though the reference shows only import and account management.

| Reference feature | Required behavior |
| --- | --- |
| Header, version, ready badge | Show installed manifest version and actual imported count while unlocked; label the count “accounts” unless the profile is complete and authorized, and never imply authentication readiness from file selection alone |
| Back / Done | Return to the options overview; when opened from the popup, Done may close the extension-created management tab and focus the original tab if still present; do not attempt to programmatically reopen the popup |
| File card and Change | Accessible file input plus optional drag/drop; show actual filename/byte size and validation state; Change clears stale preview and row totals |
| Step indicator | Show Step 1 of 2 for file/rule/mode, Step 2 of 2 for validation and commit review; retain safe errors inline |
| Target field and presets | Required authorized URL-pattern field with explicit examples; chips reuse the current catalog rule or configured profile URL, never fabricated domains or CSV metadata |
| Active Tab | On explicit click, prefill a permitted HTTPS source-tab URL for review; never save, grant permission, or start import automatically |
| Mode switch | Semantic radio group, Merge & Update default and Wipe & Replace alternative, with explanatory preservation/removal text |
| Primary action | Verify → review actual changes → confirm import; reflect real progress and completed commit, not a timer |
| Stored account list | Same normalized non-password search and pagination as popup; show company/ID/username and actual metadata badges; display the catalog's rule origin as authorization scope, never a CSV metadata domain as an authorized site |
| Delete / Undo / Purge | Use the mutation behavior above, visible accessible action names, and a live status region; Undo must actually restore the account |
| Local encryption notice | Plain text such as “Accounts stay on this device and are encrypted at rest with AES-256-GCM”; do not suggest protection from the authorized page after autofill |
| Storage footer | Compute UTF-8 bytes of the committed serialized encrypted envelope, format as MiB, and label usage against the 5 MiB vault limit; do not call this Chrome's total storage quota |

For Active Tab, preserve the source tab ID when the user opens settings through the popup, where activeTab authorization is available. Re-read its current URL when the shortcut is clicked and ignore query parameters under the matching policy. If Chrome no longer permits the read, the tab has closed, or settings was opened directly without a readable source tab, disable the shortcut with “Open settings from the extension on the target website, or enter the URL.” Do not request broad tabs permission or copy the chrome-extension options URL. The source tab URL is only a suggestion and does not establish authorization.

All account rows share one catalog rule in this MVP. Different sample domains in the screenshot do not introduce independent per-account rules or multiple profiles. Filtered count and total catalog count are distinguished, and Purge confirmation always targets the total. Loading, empty, invalid-file, denied-permission, storage-failure, locked, expired-Undo, and profile-incomplete states keep the reference's visual hierarchy. Verify the page against synthetic data matching the reference plus long labels, keyboard navigation, and zoom.

### Login profile and permissions

Support one profile. Save name, exact HTTPS login URL, two field selectors, and either a success URL or a success-element selector plus its exact observation URL. Require login and success to have identical parsed origins, including effective port. Profile URLs reject userinfo, wildcards, and non-HTTPS schemes; only the separate catalog import rule supports the limited path wildcard defined above. The profile login URL must satisfy that rule. Match profile routes by exact origin, pathname, and hash; ignore query parameters. `/login` and `/login/` differ. Hash routes are supported through exact configured hashes. URL-only success must differ from the login route; element-based success may use the same route. Saving a complete authorized profile records the reviewed catalog-rule revision.

Declare `storage`, `scripting`, `activeTab`, and `alarms`, with `optional_host_permissions: ["https://*/*"]`. Request only the configured origin after the user clicks Save/Authorize. No host access is initially granted. Broad optional eligibility is needed because the user chooses the origin later; Chrome grants host permission at origin granularity, while extension logic further restricts paths. Do not request `tabs`, browsing-history, clipboard, downloads, network interception, or unlimited-storage permissions.

Register a top-frame isolated-world content script for the granted origin. Its first operations check the URL and ask the worker whether a profile/attempt authorizes activity; it never searches forms on other routes. Observe only the configured login and success routes. Existing tabs receive the same packaged script on explicit fill if necessary. Profile updates increment revision, cancel attempts, remove obsolete registration/permission, and register the new policy; permission failure leaves filling disabled until resolved. Permission revocation cancels activity.

### Autofill protocol

Only packaged popup/options pages can request privileged commands. Validate runtime message shapes and sender identity; distinguish trusted extension-page commands from narrowly allowed content-script acknowledgements/observations. Expose no external message API. Content scripts cannot enumerate the vault or ask for arbitrary account passwords.

On Use this account or Autofill: check unlock/expiry, account existence, active tab, permission, approved catalog-rule revision, current-page match against the catalog rule, and exact current-page match against the profile login route. Obtain the current top-frame document ID via a credential-free inspection. Validate both selectors resolve to exactly one distinct visible enabled writable `HTMLInputElement` in the top-level light DOM; username must be text/email, password must be password. Reject forms with an explicit cross-origin action. Validate the configured success condition is not already true.

Send only the selected username/password to that exact document, not merely its tab ID. The content script repeats URL/field validation immediately before writing, uses native input value setters with bubbling input/change events, checks that the expected fields still exist and retain their values, and acknowledges without returning secrets. Never click a button or call form submission. Navigation before delivery or failed validation aborts. If one write fails after another succeeds, report partial/failed fill, clear only values still equal to the extension-written values, and do not create an attempt or update history.

Before delivery, reserve a two-minute attempt with acknowledged=false so input-edit cancellation is active immediately after filling. No success observation is accepted while unacknowledged. After a successful acknowledgement, activate the still-current attempt and move its account ID to the front of recents (unique, maximum 10). A cancelled token cannot be resurrected by a late acknowledgement. Selection alone does neither. The content script clears transient credential references as soon as possible; the intended website can read values once filled. Locking the extension does not erase fields already delivered to the application.

### Success tracking and consistency

The content script is passive without a pending attempt. During an attempt, check URL transitions and use a scoped MutationObserver for element visibility; a short bounded interval handles same-document route changes without injecting code into the page's main world. A newly loaded script on the permitted success route can resume a full-navigation attempt by querying the worker. Listeners are registered at worker top level so worker suspension does not disable them.

Accept success only while unlocked and before expiry, for the matching tab, profile/revision, vault revision, and extant account. Require the configured condition to transition from false at fill to true afterward. A selector must resolve to a visible element on its configured route. URL-only mode verifies the current top-frame URL. For element mode, correlate the sender's document with the current top frame using a credential-free probe, then recheck the element in that document before committing. Do not accept page-originated messages or stale-document observations.

The latest acknowledged fill in a tab supersedes its old attempt. Editing either login input while still on the login page cancels attribution. Tab close, profile edits, any account-management mutation, permission removal, lock, timeout, or navigation outside the two configured routes cancels the attempt. Failed login leaves the previous successful ID untouched. On accepted success, write only the account ID reference and observed timestamp to encrypted profile history, consume the attempt, and retain recents. Multiple tabs have independent attempts; validated successes commit serially in observation order. IDs removed by account management never reappear through stale messages. History commits do not increment the catalog revision used by attempts; account/rule mutations do. A separate snapshot write revision serializes all writes and invalidates Undo or import previews when their exact snapshots become stale.

Configured URL/element evidence cannot independently prove which server-side identity authenticated. Ambiguous signals must be addressed by choosing a stronger application-specific marker; the MVP does not scrape or infer identity.

## Constraints

- Minimum target: current stable desktop Chrome with Manifest V3 and document-targeted scripting/message support; verify concrete minimum version during implementation.
- All executable code and assets ship inside the extension. Use a restrictive extension CSP with no remote script, eval, inline execution, or application data networking.
- Imported plaintext exists transiently during local parsing, encryption, search, and intended autofill. JavaScript cannot promise physical memory erasure; remove references and enforce API boundaries.
- Never include credentials, imported rows, or master passwords in logs, analytics, errors, test artifacts, or snapshots. Tests use synthetic credentials only.
- The supported environment is top-level HTTPS forms in ordinary Chrome windows. No arbitrary-site heuristics or selector fallbacks.

## Key Decisions

- TypeScript with plain UI components keeps this small extension independent of a frontend runtime framework.
- Worker-owned encryption and writes prevent popup closure from being a storage consistency boundary.
- Trusted session key storage tolerates MV3 suspension; persistent key storage and plaintext localStorage are rejected.
- Explicit origin permission plus exact route checks separates Chrome's coarse permission model from product authorization.
- Import change previews and one encrypted snapshot prevent partial merge/replacement or target rebinding. Delete/Undo/purge use the same mutation boundary.
- Last-successful and recent references remain distinct, with bounded attribution after a real fill.
- Automatic form-disappearance detection is rejected because it is too ambiguous for successful-login history.

## Validation Strategy

Import-rule acceptance covers first import, exact URLs, root/path-prefix patterns, wildcard host rejection, encoded stars, query/hash normalization, lookalike origins, changed targets, presets, missing source-tab access, cancellation, and failed storage. Verify that a broad path pattern cannot bypass the exact profile route and that changed rules clear history and require renewed profile review.

Account-management verification covers merge add/update/unchanged preservation, invalid updates, cross-rule merge rejection, final-result size limits, Replace removal counts, confirmed/cancelled purge while filtered, delete/Undo expiry, second deletion, lock, worker suspension, stale previews, concurrent writes, storage failures, and count/usage refresh. Verify that Undo restores the account only and never resurrects stale history or purged data. Tests use synthetic credentials; screenshots never contain passwords.

Domain tests cover CSV quoting/newlines/BOM, duplicate IDs, invalid rows, normalization, multi-field token matching, password exclusion, URL lookalikes/ports/hashes, encryption round trips/tampering/wrong password, expiry, stale revisions, and history ordering. Storage tests simulate quota failure and interrupted writes. Browser acceptance covers manual submit, failed login, success URL/element, SPA/full navigation, worker suspension, lock during work, multiple tabs, navigation during fill, unsupported frames, denied/revoked permissions, and hostile metadata. A storage inspection confirms ciphertext-only persistence. Measure search at the proposed catalog limit. Real-site acceptance remains pending until the user configures the profile.

## Out of Scope

See HLD non-goals. Master-password changes, encrypted export/import, recovery keys, passkeys, and enterprise policy deployment are also deferred.

## Documentation Basis

Chrome documentation retrieved through Context7 during specification:

- [Storage API and session storage lifecycle](https://developer.chrome.com/docs/extensions/reference/storage)
- [Optional host permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [Scripting API and dynamic registration](https://developer.chrome.com/docs/extensions/reference/api/scripting)
- [Service worker event registration](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/events)
- [Extension security guidance](https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure)

These sources support platform boundaries. Encryption parameters, timeout values, import limits, and UI behavior above are proposed product decisions rather than Chrome requirements.

## Available-height constraint

Per the user’s layout correction, both popup and settings panels fit within 600px or the available viewport, whichever is smaller. Settings subtracts its outer spacing. Header and footer remain visible while the central content scrolls internally.
