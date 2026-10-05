# Account Login Assistant — EARS Specifications

## Input matching expansion (2026-10-05)

Username and password can independently match by CSS (legacy default), exact id/name, autocomplete token, placeholder, visible associated label including aria-labelledby, or aria-label. Text labels normalize whitespace/case; id/name remain exact. Non-CSS candidates must be visible, writable, supported inputs; ambiguity aborts. Revalidate the same input identities before each write. Editing filled inputs cancels login attribution for every match mode. Route/permission restrictions and manual submission remain.


## Named CSV groups — current scope (2026-10-05)

The user expanded the single-catalog design to named CSV groups. Each group owns independent encrypted storage/key, accounts, URL rule, login profile, history, preview, write queue and Undo. Existing data remains in the default Imported accounts group. UI requests carry the selected group ID; content observations route only to the owning live attempt. New explicit fills supersede attempts across groups in the same tab. Duplicate account IDs across groups are valid. Merge, Replace, Purge and Reset affect only the selected group. Permission removal must retain hosts used by another group. Group names are editable and required (1–80 characters, unique ignoring case); at most 50 groups. Upload another CSV defaults to Merge within the selected group. A packaged sample CSV contains headers and three synthetic rows. This supersedes all historical single-profile/single-catalog scope below.


## Synthetic-data mode — supersedes password-lock requirements (2026-10-05)

The user removed the lock feature for synthetic-only data. New installations create a ready-to-use local catalog automatically. No setup password, lock button, idle timer, TOUCH renewal, startup lock, or alarms permission remains. The snapshot retains AES-GCM but persists its key in trusted local storage; this does not provide user-password protection. Existing encrypted catalogs migrate once with their old key/session or previous password, preserving data on failure. Reset clears old state and creates an empty ready catalog. Origin authorization, explicit filling, password-free summaries, transactional imports, and attempt/Undo expiry remain. Historical locked-state instructions below are superseded by this amendment.


Status: Planning baseline accepted through the user’s request to continue planning. Implementation awaits plan review. Intent flows from [HLD](../hld/account-login-assistant.md) through [LLD](../lld/account-login-assistant.md) to these requirements, then to implementation and tests.

## Unit 1: Local vault

**Why:** Keep imported credentials local and protected when the extension is locked.

| ID | EARS statement |
| --- | --- |
| R-1.1 | THE SYSTEM SHALL implement a Manifest V3 Chrome extension using TypeScript and packaged local assets without application data networking, telemetry, or synchronization. |
| R-1.2 | WHEN the user creates a vault, THE SYSTEM SHALL require a confirmed master password of at least 12 characters and explain that forgotten passwords have no recovery mechanism. |
| R-1.3 | THE SYSTEM SHALL encrypt accounts and history with AES-256-GCM using PBKDF2-HMAC-SHA-256 at 600,000 iterations, a random 16-byte salt, and a fresh random 12-byte IV per encryption, authenticating the versioned envelope metadata. |
| R-1.4 | THE SYSTEM SHALL persist only encrypted account/history data and non-secret envelope/profile configuration, without persisting a plaintext key or master password. |
| R-1.5 | WHILE the vault is unlocked, THE SYSTEM SHALL restrict the session key to trusted extension session storage and decrypted account/search caches to extension memory. |
| R-1.6 | WHEN the user locks the vault or 15 minutes elapse without explicit extension interaction, THE SYSTEM SHALL invalidate the session generation and clear keys, decrypted caches, pending imports, and login attempts. |
| R-1.7 | WHEN Chrome restarts or the extension is reloaded, updated, or disabled, THE SYSTEM SHALL require a new unlock before credentials become available. |
| R-1.8 | IF a privileged operation begins or commits after session expiry or generation invalidation, THE SYSTEM SHALL reject it without restoring stale state. |
| R-1.9 | IF decryption or format validation fails, THE SYSTEM SHALL preserve the stored vault and return a safe error containing no secrets. |
| R-1.10 | WHEN the user explicitly confirms destructive reset, THE SYSTEM SHALL delete the vault, profile, session state, dynamic registrations, and granted profile host permission. |

## Unit 2: CSV validation and import modes

**Why:** Import evolving account datasets without ambiguous identities or accidental partial replacement.

| ID | EARS statement |
| --- | --- |
| R-2.1 | WHEN a CSV is selected, THE SYSTEM SHALL parse UTF-8 with optional BOM, CRLF/LF, quoted commas/newlines, and doubled-quote escapes locally. |
| R-2.2 | IF required normalized headers account_id, username, or password are missing, header names are empty/duplicated, UTF-8 is invalid, or CSV quoting is malformed, THE SYSTEM SHALL reject the file without changing the vault. |
| R-2.3 | WHEN validating a row, THE SYSTEM SHALL trim account ID and username, preserve password whitespace exactly, retain every metadata field as text, and ignore entirely blank records. |
| R-2.4 | IF a row has a mismatched field count, empty trimmed account ID/username, or empty password, THE SYSTEM SHALL mark that row invalid. |
| R-2.5 | IF a normalized case-sensitive account ID occurs more than once, THE SYSTEM SHALL mark every row containing that ID invalid. |
| R-2.6 | WHEN parsing completes, THE SYSTEM SHALL show found, valid, and invalid record counts and logical-record row numbers with safe error codes, without raw row contents or passwords. |
| R-2.7 | IF the file exceeds 2 MiB, 10,000 data rows, or 100 columns, or the resulting catalog exceeds 10,000 accounts or its serialized encrypted envelope exceeds 5 MiB, THE SYSTEM SHALL reject the import and preserve the existing vault. |
| R-2.8 | WHEN the user confirms Wipe & Replace on a current preview containing at least one valid account, THE SYSTEM SHALL atomically replace accounts with the valid rows and confirmed target rule in one encrypted snapshot. |
| R-2.9 | IF the preview has zero valid accounts, or import is cancelled, locked, stale, or fails encryption/storage, THE SYSTEM SHALL preserve the previous account database. |
| R-2.10 | WHEN an import succeeds, THE SYSTEM SHALL increment the catalog revision, cancel pending login attempts and Undo, remove history references to absent IDs, clear last-successful references whose credentials changed, and clear all history and profile approval if the target rule changes. |
| R-2.11 | WHEN the user selects a CSV to import, THE SYSTEM SHALL require a Target authorized URL pattern field, prefilled from the current catalog when available, and show its normalized form in the preview. |
| R-2.12 | IF the import rule is blank, non-HTTPS, contains userinfo or wildcard origin/hash components, or contains anything other than one optional terminal pathname star, THE SYSTEM SHALL block import confirmation without changing existing data. |
| R-2.13 | WHEN import commits, THE SYSTEM SHALL persist the confirmed catalog rule and rule revision atomically with accounts and resulting history inside the encrypted snapshot. |
| R-2.14 | IF import is cancelled or fails validation, encryption, or storage, THE SYSTEM SHALL preserve both the previous account catalog and its URL binding. |
| R-2.15 | IF the imported rule changes or no complete approved profile exists, THE SYSTEM SHALL finish the valid import, present a Configure login fields for this URL action, and withhold autofill until a matching exact login profile is saved and authorized for the current rule revision. |
| R-2.16 | WHEN an import begins, THE SYSTEM SHALL default to Merge & Update and offer Wipe & Replace as an explicit alternative. |
| R-2.17 | WHEN the user confirms Merge & Update, THE SYSTEM SHALL add new account IDs, replace complete records for existing valid IDs, preserve absent records, and leave existing records unchanged for invalid incoming rows. |
| R-2.18 | IF a populated catalog's normalized target rule differs from a proposed merge rule, THE SYSTEM SHALL reject the merge and require an explicit switch to Replace to change the target. |
| R-2.19 | WHEN validating an import, THE SYSTEM SHALL show added, updated, removed, unchanged, and invalid counts before final confirmation and clearly disclose Replace removals caused by excluded invalid rows. |
| R-2.20 | WHEN the file, target rule, mode, or snapshot revision changes, THE SYSTEM SHALL invalidate the preview and require fresh validation before commit. |
| R-2.21 | WHEN evaluating a catalog rule, THE SYSTEM SHALL match the exact parsed origin and hash, match pathname exactly or by its configured terminal-star prefix, ignore query parameters, and never interpret encoded stars as wildcards. |

## Unit 3: Authorized login profile

**Why:** Restrict credential delivery and success observation to a user-authorized application.

| ID | EARS statement |
| --- | --- |
| R-3.1 | THE SYSTEM SHALL support one configurable profile containing name, HTTPS login route, username/password CSS selectors, and either a success route or a visible-element selector on a success route. |
| R-3.2 | IF profile URLs contain userinfo, wildcards, non-HTTPS schemes, or different origins, THE SYSTEM SHALL reject the profile. |
| R-3.3 | WHEN evaluating a route, THE SYSTEM SHALL compare parsed origin including port, exact pathname, and exact hash while ignoring query parameters. |
| R-3.4 | IF URL-only success equals the login route, THE SYSTEM SHALL reject that success configuration. |
| R-3.5 | WHEN the user saves and authorizes a profile, THE SYSTEM SHALL request permission only for its HTTPS origin and register top-frame isolated content scripts scoped to that origin. |
| R-3.6 | THE SYSTEM SHALL request only storage, scripting, activeTab, alarms, and runtime-selected optional host permission necessary for the documented MVP. |
| R-3.7 | WHERE a document is outside the configured login and success routes, THE SYSTEM SHALL perform no credential field detection, filling, or authenticated-element inspection. |
| R-3.8 | WHEN the profile changes or permission is removed, THE SYSTEM SHALL invalidate attempts and disable obsolete profile activity. |
| R-3.9 | IF authorization is denied or required selectors/configuration are invalid, THE SYSTEM SHALL keep autofill unavailable and display an actionable safe error. |
| R-3.10 | IF a proposed exact profile login URL does not satisfy the catalog rule, THE SYSTEM SHALL reject activation and explain that changing the catalog target requires a new import; WHEN an approved profile is saved, THE SYSTEM SHALL bind its approval to the current catalog-rule revision. |

## Unit 4: Account search and confirmation

**Why:** Let users identify an intended account among many records without exposing passwords.

| ID | EARS statement |
| --- | --- |
| R-4.1 | WHILE unlocked, THE SYSTEM SHALL search account IDs, usernames, and every metadata name/value using NFKC-normalized case-insensitive substring matching. |
| R-4.2 | WHEN a query contains whitespace-separated terms, THE SYSTEM SHALL return only accounts for which every term matches at least one indexed field. |
| R-4.3 | THE SYSTEM SHALL exclude passwords from searchable content, summaries, snippets, ordering, diagnostics, and copy actions. This is the proposed exception to the source brief requiring spec approval. |
| R-4.4 | WHEN displaying results, THE SYSTEM SHALL use stable account-ID order, paginate at 50 records, and display the total match count. |
| R-4.5 | WHEN the user selects a result, THE SYSTEM SHALL show its account ID, username, and metadata for confirmation without filling until the user activates Autofill. |
| R-4.6 | WHEN Use this account is activated on the last-successful card, THE SYSTEM SHALL initiate the same validated autofill protocol directly. |
| R-4.7 | THE SYSTEM SHALL render imported content as inert text and provide keyboard-operable controls and explicit empty, loading, locked, unsupported-site, and error states. |
| R-4.8 | WHILE locked, THE SYSTEM SHALL withhold accounts, search results, history details, and autofill capability. |
| R-4.9 | THE SYSTEM SHALL target search responses within 200 ms after the final keystroke for the 10,000-account acceptance dataset and report the measured result and machine used. |

## Unit 5: Explicit credential autofill

**Why:** Fill the intended authorized form with minimal interaction while preserving manual login control.

| ID | EARS statement |
| --- | --- |
| R-5.1 | WHEN an autofill action is requested, THE SYSTEM SHALL validate the trusted extension-page sender, unlocked session, account, active tab, permission, current approved catalog-rule revision, current-page match against both the catalog rule and exact profile login route, and current top-frame document. |
| R-5.2 | IF either selector fails to resolve to exactly one distinct visible enabled writable supported input, or a form explicitly targets another origin, THE SYSTEM SHALL reject autofill before writing credentials. |
| R-5.3 | THE SYSTEM SHALL support text/email username inputs and password-type password inputs only in the top-level light DOM. |
| R-5.4 | WHEN credentials are delivered, THE SYSTEM SHALL target the validated document ID and revalidate URL and fields immediately before assigning values. |
| R-5.5 | WHEN filling supported inputs, THE SYSTEM SHALL use native setters and input/change events, verify retained values, and return a credential-free acknowledgement. |
| R-5.6 | THE SYSTEM SHALL never click Login, submit a form, display plaintext passwords, or expose an API that lets a content script enumerate accounts or request arbitrary credentials. |
| R-5.7 | IF navigation, validation, or field assignment invalidates a fill, THE SYSTEM SHALL report failure, avoid updating recent/successful history, and remove any partial value still equal to what that fill wrote. |
| R-5.8 | THE SYSTEM SHALL reject unrecognized runtime messages and page-originated or external credential requests. |

## Unit 6: Recent and last-successful accounts

**Why:** Make frequent accounts easy to reuse without confusing attempted login with observed success.

| ID | EARS statement |
| --- | --- |
| R-6.1 | WHEN both fields are successfully acknowledged as filled, THE SYSTEM SHALL move the account ID to the front of a unique per-profile recent list limited to 10 and create an attempt expiring in two minutes. |
| R-6.2 | WHEN an account is selected without successful fill, THE SYSTEM SHALL leave recent and last-successful history unchanged. |
| R-6.3 | THE SYSTEM SHALL associate each pending attempt with its token, tab, originating document, profile/revision, vault revision, account ID, timestamps, and success baseline without including credentials. |
| R-6.4 | IF the configured success condition is already true before fill, THE SYSTEM SHALL refuse to create an attributable attempt. |
| R-6.5 | WHEN the configured success condition becomes true after an acknowledged fill, THE SYSTEM SHALL validate the current top-frame observation, unexpired current attempt, unlocked session, matching revisions, and existing account before committing its ID as last successful. |
| R-6.6 | WHERE success is element-based, THE SYSTEM SHALL require a visible matching element on the configured route and revalidate it in the current document. |
| R-6.7 | THE SYSTEM SHALL support authorized full-page and same-document success transitions, including worker suspension between fill and observation. |
| R-6.8 | IF authentication fails or no qualifying success is observed, THE SYSTEM SHALL preserve the prior last-successful account. |
| R-6.9 | WHEN another acknowledged fill occurs in the same tab, THE SYSTEM SHALL supersede that tab's older attempt. |
| R-6.10 | WHEN input values are edited on the login page, the tab closes, the attempt expires, the profile/vault changes, permission is revoked, the vault locks, or navigation leaves the configured routes, THE SYSTEM SHALL cancel attribution. |
| R-6.11 | WHEN success commits, THE SYSTEM SHALL consume the attempt and persist only the account ID reference in encrypted history rather than a separate password. |
| R-6.12 | WHEN multiple tabs report valid successes, THE SYSTEM SHALL serialize commits in observation order and reject stale references before writing. |
| R-6.13 | WHEN success commits, THE SYSTEM SHALL persist its observed timestamp with the account reference, display a time only when available, and clear that time whenever the corresponding reference is removed. |

## Unit 7: Delivery and verification

**Why:** Produce a usable extension whose supported behavior and limitations can be checked.

| ID | EARS statement |
| --- | --- |
| R-7.1 | THE SYSTEM SHALL provide reproducible build instructions, an unpacked extension output, profile/import/unlock instructions, and a synthetic example CSV in the implementation deliverable. |
| R-7.2 | THE SYSTEM SHALL be verified with domain tests and browser scenarios for import failure, unauthorized routes, credential handling, failed/successful login, navigation races, worker suspension, permission removal, lock expiry, and concurrent tabs. |
| R-7.3 | THE SYSTEM SHALL keep secrets out of logs, errors, telemetry, screenshots, and test artifacts, using synthetic credentials in fixtures. |
| R-7.4 | IF the real application's profile has not been configured and exercised, THE SYSTEM SHALL describe real-site compatibility as unverified rather than claim successful integration. |

## Unit 8: Supplied popup style

**Why:** Reproduce the user's chosen compact popup appearance while keeping each control and status truthful.

| ID | EARS statement |
| --- | --- |
| R-8.1 | THE SYSTEM SHALL use the supplied screen.png and code.html light slate/white/indigo visual style, taking precedence over the conflicting dark palette in DESIGN.md. |
| R-8.2 | THE SYSTEM SHALL present the reference's compact branded header, authorized-profile strip, featured account card, search, rounded account rows, and count/Lock footer using the tokens defined in the LLD. |
| R-8.3 | THE SYSTEM SHALL target a 380px-wide popup with height capped at the smaller of 600px and the available viewport, with accessible internal vertical scrolling, excluding the reference's outer presentation canvas and fixed 884px minimum height. |
| R-8.4 | THE SYSTEM SHALL load popup styles, fonts, icons, and scripts from packaged local assets without runtime CDN, Google Fonts, or inline demo scripts. |
| R-8.5 | WHEN rendering accounts, badges, counts, timestamps, and authorization indicators, THE SYSTEM SHALL derive them from actual vault/profile/tab state rather than reference placeholders. |
| R-8.6 | THE SYSTEM SHALL label last-successful history distinctly from recent accounts and search results, preserving selection confirmation before autofill for list results. |
| R-8.7 | WHEN the user presses / while unlocked and focus is outside editable controls with no modifier keys, THE SYSTEM SHALL focus the search field. |
| R-8.8 | IF a displayed shortcut or action has no implemented behavior, THE SYSTEM SHALL omit it rather than present a decorative functional control. |
| R-8.9 | WHEN a fill or lock operation completes, THE SYSTEM SHALL show completion only after the corresponding real acknowledgement, without equating filled fields to authenticated login. |
| R-8.10 | THE SYSTEM SHALL apply the supplied style to locked, empty, unauthorized, loading, error, and confirmation states with visible focus, accessible labels, reduced-motion support, and usable long-content layouts. |

## Unit 9: Settings page and account management

**Why:** Let users import, maintain, and remove the local account catalog using the supplied settings workflow.

| ID | EARS statement |
| --- | --- |
| R-9.1 | THE SYSTEM SHALL reproduce the light settings reference from stitch_account_login_assistant_extension-2 with its import panel, file card, URL field/shortcuts, mode switch, searchable account list, local-encryption notice, usage footer, and Back/Done controls. |
| R-9.2 | WHEN the user selects or changes a file, THE SYSTEM SHALL show its actual name, byte size, and validation state and discard stale preview results. |
| R-9.3 | THE SYSTEM SHALL separate file/rule/mode selection from validation review and commit as two visible import stages. |
| R-9.4 | WHEN a URL preset or Active Tab shortcut is selected, THE SYSTEM SHALL populate the input for review without automatically importing, saving a rule, or granting host permission. |
| R-9.5 | IF a permitted HTTPS source tab cannot be read, THE SYSTEM SHALL disable Active Tab with an actionable explanation and allow manual URL entry without requesting broad tabs permission. |
| R-9.6 | THE SYSTEM SHALL derive preset chips from configured catalog/profile values and account authorization-domain labels from the one catalog rule, never from illustrative domains or arbitrary CSV metadata. |
| R-9.7 | WHEN filtering stored accounts, THE SYSTEM SHALL apply the popup's non-password search semantics and pagination and distinguish filtered counts from the total catalog count. |
| R-9.8 | WHEN the user deletes an account, THE SYSTEM SHALL atomically remove it, prune its history, increment the catalog revision, cancel pending attempts, and show completion only after persistence succeeds. |
| R-9.9 | WHEN individual deletion succeeds, THE SYSTEM SHALL offer a single 30-second Undo opportunity backed by an encrypted session tombstone bound to the post-delete snapshot revision, catalog rule, session generation, and expiry. |
| R-9.10 | WHEN a valid Undo is activated, THE SYSTEM SHALL atomically restore the deleted account without restoring old history, consume the Undo token, and refresh affected views. |
| R-9.11 | IF Undo expires or its session, rule, or snapshot changes, THE SYSTEM SHALL reject restoration and remove the actionable Undo control with an explanatory status. |
| R-9.12 | WHEN Purge All is selected, THE SYSTEM SHALL ask for explicit confirmation displaying the entire catalog count regardless of the current filter and state that purge cannot be undone. |
| R-9.13 | WHEN purge is confirmed, THE SYSTEM SHALL atomically empty accounts/history, invalidate Undo and attempts, and preserve initialized vault setup, catalog rule, and profile settings; WHEN cancelled, THE SYSTEM SHALL leave all data unchanged. |
| R-9.14 | IF any account-management write fails or becomes stale, THE SYSTEM SHALL preserve the last committed snapshot and report a safe error instead of simulating success. |
| R-9.15 | WHEN committed data changes, THE SYSTEM SHALL refresh account/search counts, history, storage usage, and relevant open extension views from the committed state. |
| R-9.16 | THE SYSTEM SHALL display actual serialized encrypted-envelope usage against the 5 MiB product vault limit and the installed extension version, without placeholder totals or claims about Chrome's total quota. |
| R-9.17 | WHILE locked, THE SYSTEM SHALL withhold account details and counts and disable import, delete, Undo, and purge until unlock. |
| R-9.18 | THE SYSTEM SHALL implement settings controls with packaged scripts/assets, accessible focus and labels, truthful status messages, a panel capped at the smaller of 600px and the available viewport with internal scrolling and visible header/footer, and zoom, without executing the reference's inline demos or loading its CDN resources. |
| R-9.19 | WHEN Back or Done is activated, THE SYSTEM SHALL return to the settings overview or close its extension-created management tab and focus the source tab if available, without claiming to reopen the browser popup. |
