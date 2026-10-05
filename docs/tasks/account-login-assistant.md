# Account Login Assistant — Tasks

## Named CSV groups — current scope (2026-10-05)

The user expanded the single-catalog design to named CSV groups. Each group owns independent encrypted storage/key, accounts, URL rule, login profile, history, preview, write queue and Undo. Existing data remains in the default Imported accounts group. UI requests carry the selected group ID; content observations route only to the owning live attempt. New explicit fills supersede attempts across groups in the same tab. Duplicate account IDs across groups are valid. Merge, Replace, Purge and Reset affect only the selected group. Permission removal must retain hosts used by another group. Group names are editable and required (1–80 characters, unique ignoring case); at most 50 groups. Upload another CSV defaults to Merge within the selected group. A packaged sample CSV contains headers and three synthetic rows. This supersedes all historical single-profile/single-catalog scope below.


## Synthetic-data mode — supersedes password-lock requirements (2026-10-05)

The user removed the lock feature for synthetic-only data. New installations create a ready-to-use local catalog automatically. No setup password, lock button, idle timer, TOUCH renewal, startup lock, or alarms permission remains. The snapshot retains AES-GCM but persists its key in trusted local storage; this does not provide user-password protection. Existing encrypted catalogs migrate once with their old key/session or previous password, preserving data on failure. Reset clears old state and creates an empty ready catalog. Origin authorization, explicit filling, password-free summaries, transactional imports, and attempt/Undo expiry remain. Historical locked-state instructions below are superseded by this amendment.


Status: All 52 implementation stories completed and committed under the user's explicit build authorization. Verification: 58 focused tests, 48 browser checks, TypeScript and production build passed. See [verification](../verification/account-login-assistant.md) for native permission-dialog, lifecycle, browser-version, and real-site limitations.

Sources: [HLD](../hld/account-login-assistant.md), [LLD](../lld/account-login-assistant.md), and [EARS](../ears/account-login-assistant.md). The EARS document owns acceptance behavior; task descriptions do not add product scope.

## Delivery order and checkpoints

| Checkpoint | Outcome | Story ordering |
| --- | --- | --- |
| 1. Foundation and protected vault | A loadable TypeScript extension, supplied visual shells, synthetic fixtures, and a usable encrypted setup/unlock/lock flow | 1.1, 7.3, 8.1, 9.1, 1.3, 1.2, 1.4, 1.5 |
| 2. Imported and maintained catalog | Required URL rule, safe Merge/Replace preview, authorized profile, search, and delete/Undo/purge management | Units 2 and 3 in dependency order, 1.6, 4.1–4.2, 4.4, then Unit 9 |
| 3. Intentional autofill | One selected account fills only a validated document and leaves submission to the user | Unit 5 in dependency order |
| 4. Verified history and finished popup | Correct success attribution across navigation/tabs, wired popup interactions, and measured large-catalog search | Unit 6, 4.3, 8.2–8.5, 4.5 |
| 5. Acceptance and installable delivery | Browser evidence, source-aligned UI, reproducible unpacked build, and user instructions | 7.2, then 7.1 |

Checkpoints are integration milestones rather than separate approval gates. Resolve each story's listed dependencies before beginning it. Grouping by EARS unit below is for traceability, not a command to execute in numeric order.

## Implementation boundaries

- Build the complete agreed MVP: one catalog rule and one login profile, master-password vault, both import modes, popup/settings designs, account management, manual submission, and observed-success history. Exclude password search as defined by R-4.3.
- Preserve the uploaded references as inert local design material during implementation; do not execute their demos or ship CDN scripts. Use screenshot/HTML light themes over conflicting DESIGN.md dark palettes.
- Keep TypeScript/domain logic, worker-owned state, content-script checks, and extension UI separated as in the LLD. Create the applicable source-directory AGENTS.md files before first source edits and maintain their boundaries.
- At planning time the workspace contained only specifications. Implementation now includes source-boundary AGENTS.md files. The codebase-memory index was unavailable; direct source review and tests supplied implementation evidence. A local graphify index was refreshed after implementation.
- Pin and document the bundler, maintained CSV parser, test runner, browser harness, and asset versions during story 1.1/2.1 after checking current primary documentation through Context7. Do not choose unverified versions in this plan.
- Serialize writes with separate catalog, rule, and snapshot revisions. Dependencies on a shared worker contract are explicit; mutex tags prevent simultaneous edits to shared modules and do not request parallel agents.
- Use synthetic data and isolated browser profiles for tests. No real credential fixtures, credential-bearing screenshots, telemetry, runtime remote fonts, or remote application service.
- Plan estimates are rough implementation-sizing aids, include focused checks, and are not calendar commitments. Browser compatibility and debugging can change them. Keep private implementation notes outside this shared task file.

## Verification and completion rules

Each story has exact EARS acceptance references, a focused verification step, and an empty landed field. Closely related requirements share a story where they exercise one behavior. Check a story only after its acceptance passes; record the actual commit SHA and produced source/test files in landed when committed. If work is verified but uncommitted, record that honestly in implementation progress and leave the story unchecked until its required landing evidence exists. Do not fabricate commits or initialize/publish a remote repository for tracking.

The integrated acceptance task follows the focused story checks; it adds cross-component browser evidence rather than repeatedly rerunning unchanged checks. Final delivery records any unavailable browser capability or missing real-site configuration explicitly. The real website's URL, selectors, and reliable success signal are intentionally configured later; controlled fixtures allow implementation to proceed without them.

## Unit 1: Local vault

- [x] 1.1 Create the loadable TypeScript extension (est: ~45m) (mutex: build)
  - why: Establish a real Chrome extension in which each following feature can be exercised.
  - acceptance: R-1.1 — THE SYSTEM SHALL implement a Manifest V3 Chrome extension using TypeScript and packaged local assets without application data networking, telemetry, or synchronization.
  - verify: Resolve current build/API documentation and pin tool versions; build and load the unpacked MV3 extension in an isolated browser profile; inspect packaged scripts/CSP and confirm no remote runtime assets or application-data requests.
  - landed: `736d88c`, `4ab1acc`, `2e73dd9`, `f9963bc` — `src/background/service.ts`, `src/background/index.ts`, `src/background/service.test.ts`, `src/domain/crypto.ts`, `src/domain/domain.test.ts`, `src/ui/common.ts`, `tests/browser/run.mjs`.

- [x] 1.2 Create and unlock a password-protected vault (deps: 1.3, 9.1, est: ~35m) (mutex: options)
  - why: Make the local security model understandable at first use.
  - acceptance: R-1.2 — WHEN the user creates a vault, THE SYSTEM SHALL require a confirmed master password of at least 12 characters and explain that forgotten passwords have no recovery mechanism.
  - verify: Exercise password length, exact whitespace preservation, confirmation mismatch, successful setup/unlock, and visible no-recovery explanation without logging input.
  - landed: `736d88c`, `4ab1acc`, `2e73dd9`, `f9963bc` — `src/background/service.ts`, `src/background/index.ts`, `src/background/service.test.ts`, `src/domain/crypto.ts`, `src/domain/domain.test.ts`, `src/ui/common.ts`, `tests/browser/run.mjs`.

- [x] 1.3 Encrypt and atomically persist the vault (deps: 1.1, est: ~75m) (mutex: vault)
  - why: Protect stored accounts while preserving usable data after invalid unlocks or corrupt input.
  - acceptance: R-1.3 — THE SYSTEM SHALL encrypt accounts and history with AES-256-GCM using PBKDF2-HMAC-SHA-256 at 600,000 iterations, a random 16-byte salt, and a fresh random 12-byte IV per encryption, authenticating the versioned envelope metadata.
  - acceptance: R-1.4 — THE SYSTEM SHALL persist only encrypted account/history data and non-secret envelope/profile configuration, without persisting a plaintext key or master password.
  - acceptance: R-1.9 — IF decryption or format validation fails, THE SYSTEM SHALL preserve the stored vault and return a safe error containing no secrets.
  - verify: Test specified KDF/AES-GCM parameters, fresh salts/IVs, round trip, wrong password, tampered authenticated metadata/ciphertext, unsupported version, and ciphertext-only persistent storage; preserve the prior snapshot on each failure.
  - landed: `736d88c`, `4ab1acc`, `2e73dd9`, `f9963bc` — `src/background/service.ts`, `src/background/index.ts`, `src/background/service.test.ts`, `src/domain/crypto.ts`, `src/domain/domain.test.ts`, `src/ui/common.ts`, `tests/browser/run.mjs`.

- [x] 1.4 Retain trusted unlocked state across worker suspension (deps: 1.3, est: ~55m) (mutex: session)
  - why: Avoid repeated unlocks during normal worker suspension while locking after browser or extension lifecycle resets.
  - acceptance: R-1.5 — WHILE the vault is unlocked, THE SYSTEM SHALL restrict the session key to trusted extension session storage and decrypted account/search caches to extension memory.
  - acceptance: R-1.7 — WHEN Chrome restarts or the extension is reloaded, updated, or disabled, THE SYSTEM SHALL require a new unlock before credentials become available.
  - verify: Suspend/restart the worker and confirm the trusted session key remains usable; restart Chrome or reload/disable the extension and confirm unlock is required; prove content scripts cannot read session storage.
  - landed: `736d88c`, `4ab1acc`, `2e73dd9`, `f9963bc` — `src/background/service.ts`, `src/background/index.ts`, `src/background/service.test.ts`, `src/domain/crypto.ts`, `src/domain/domain.test.ts`, `src/ui/common.ts`, `tests/browser/run.mjs`.

- [x] 1.5 Enforce lock expiry and invalidate in-flight operations (deps: 1.4, est: ~60m) (mutex: session)
  - why: Ensure Lock actually revokes the ability to use credentials.
  - acceptance: R-1.6 — WHEN the user locks the vault or 15 minutes elapse without explicit extension interaction, THE SYSTEM SHALL invalidate the session generation and clear keys, decrypted caches, pending imports, and login attempts.
  - acceptance: R-1.8 — IF a privileged operation begins or commits after session expiry or generation invalidation, THE SYSTEM SHALL reject it without restoring stale state.
  - verify: Use controlled time and delayed operations to verify manual/15-minute lock, delayed alarms, generation checks before commit, cleared caches/attempts/Undo, and no late writes restoring unlocked state.
  - landed: `736d88c`, `4ab1acc`, `2e73dd9`, `f9963bc` — `src/background/service.ts`, `src/background/index.ts`, `src/background/service.test.ts`, `src/domain/crypto.ts`, `src/domain/domain.test.ts`, `src/ui/common.ts`, `tests/browser/run.mjs`.

- [x] 1.6 Provide a distinct full-vault reset (deps: 1.5, 3.2, est: ~30m) (mutex: vault)
  - why: Provide an explicit recovery path that cannot be confused with deleting accounts.
  - acceptance: R-1.10 — WHEN the user explicitly confirms destructive reset, THE SYSTEM SHALL delete the vault, profile, session state, dynamic registrations, and granted profile host permission.
  - verify: Cancel reset and verify unchanged state; confirm reset and verify removal of vault/profile/session/registrations/permission, followed by first-run setup.
  - landed: `736d88c`, `4ab1acc`, `2e73dd9`, `f9963bc` — `src/background/service.ts`, `src/background/index.ts`, `src/background/service.test.ts`, `src/domain/crypto.ts`, `src/domain/domain.test.ts`, `src/ui/common.ts`, `tests/browser/run.mjs`.

## Unit 2: CSV validation and import modes

- [x] 2.1 Parse real CSV files and reject structural errors (deps: 1.1, 7.3, est: ~40m) (mutex: csv)
  - why: Accept common CSV exports without splitting quoted credentials incorrectly.
  - acceptance: R-2.1 — WHEN a CSV is selected, THE SYSTEM SHALL parse UTF-8 with optional BOM, CRLF/LF, quoted commas/newlines, and doubled-quote escapes locally.
  - acceptance: R-2.2 — IF required normalized headers account_id, username, or password are missing, header names are empty/duplicated, UTF-8 is invalid, or CSV quoting is malformed, THE SYSTEM SHALL reject the file without changing the vault.
  - verify: Synthetic fixtures cover BOM, UTF-8 errors, quoted commas/newlines/doubled quotes, CRLF/LF, missing headers, duplicate normalized headers, malformed quotes, and no writes on rejection.
  - landed: `4ab1acc`, `736d88c`, `2e73dd9` — `src/domain/csv.ts`, `src/domain/import.ts`, `src/domain/rules.ts`, `src/domain/domain.test.ts`, `src/domain/boundaries.test.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `src/options/index.ts`.

- [x] 2.2 Validate accounts and preserve arbitrary metadata (deps: 2.1, est: ~35m) (mutex: csv)
  - why: Keep account identity unambiguous and prevent accidental password normalization.
  - acceptance: R-2.3 — WHEN validating a row, THE SYSTEM SHALL trim account ID and username, preserve password whitespace exactly, retain every metadata field as text, and ignore entirely blank records.
  - acceptance: R-2.4 — IF a row has a mismatched field count, empty trimmed account ID/username, or empty password, THE SYSTEM SHALL mark that row invalid.
  - acceptance: R-2.5 — IF a normalized case-sensitive account ID occurs more than once, THE SYSTEM SHALL mark every row containing that ID invalid.
  - verify: Verify blank-record handling, field counts, required values, trimmed IDs/usernames, untouched password whitespace, unknown metadata, and invalidation of all duplicate-ID occurrences.
  - landed: `4ab1acc`, `736d88c`, `2e73dd9` — `src/domain/csv.ts`, `src/domain/import.ts`, `src/domain/rules.ts`, `src/domain/domain.test.ts`, `src/domain/boundaries.test.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `src/options/index.ts`.

- [x] 2.3 Calculate safe validation and change summaries (deps: 2.2, 2.6, 2.7, est: ~35m) (mutex: csv)
  - why: Let users understand what import will change before committing.
  - acceptance: R-2.6 — WHEN parsing completes, THE SYSTEM SHALL show found, valid, and invalid record counts and logical-record row numbers with safe error codes, without raw row contents or passwords.
  - acceptance: R-2.19 — WHEN validating an import, THE SYSTEM SHALL show added, updated, removed, unchanged, and invalid counts before final confirmation and clearly disclose Replace removals caused by excluded invalid rows.
  - verify: Verify logical-record numbers and found/valid/invalid plus add/update/remove/unchanged counts; show invalid-row-driven Replace removals without exposing raw rows or secrets.
  - landed: `4ab1acc`, `736d88c`, `2e73dd9` — `src/domain/csv.ts`, `src/domain/import.ts`, `src/domain/rules.ts`, `src/domain/domain.test.ts`, `src/domain/boundaries.test.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `src/options/index.ts`.

- [x] 2.4 Require and normalize the import target rule (deps: 1.4, 9.1, est: ~45m) (mutex: rules)
  - why: Bind imported credentials to an explicitly reviewed target.
  - acceptance: R-2.11 — WHEN the user selects a CSV to import, THE SYSTEM SHALL require a Target authorized URL pattern field, prefilled from the current catalog when available, and show its normalized form in the preview.
  - acceptance: R-2.12 — IF the import rule is blank, non-HTTPS, contains userinfo or wildcard origin/hash components, or contains anything other than one optional terminal pathname star, THE SYSTEM SHALL block import confirmation without changing existing data.
  - acceptance: R-2.21 — WHEN evaluating a catalog rule, THE SYSTEM SHALL match the exact parsed origin and hash, match pathname exactly or by its configured terminal-star prefix, ignore query parameters, and never interpret encoded stars as wildcards.
  - verify: Test exact paths, root/path-prefix rules, hashes, query removal, ports, lookalike hosts, userinfo, wildcard hosts, embedded/repeated stars, and literal encoded stars; verify required field and current-rule prefill.
  - landed: `4ab1acc`, `736d88c`, `2e73dd9` — `src/domain/csv.ts`, `src/domain/import.ts`, `src/domain/rules.ts`, `src/domain/domain.test.ts`, `src/domain/boundaries.test.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `src/options/index.ts`.

- [x] 2.5 Enforce file and final-catalog limits (deps: 2.2, 1.3, est: ~30m) (mutex: csv)
  - why: Reject oversized operations before they risk the existing catalog.
  - acceptance: R-2.7 — IF the file exceeds 2 MiB, 10,000 data rows, or 100 columns, or the resulting catalog exceeds 10,000 accounts or its serialized encrypted envelope exceeds 5 MiB, THE SYSTEM SHALL reject the import and preserve the existing vault.
  - verify: Test exact boundaries and one-over cases for bytes, rows, columns, final merged account count, and serialized encrypted size; simulate storage quota rejection.
  - landed: `4ab1acc`, `736d88c`, `2e73dd9` — `src/domain/csv.ts`, `src/domain/import.ts`, `src/domain/rules.ts`, `src/domain/domain.test.ts`, `src/domain/boundaries.test.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `src/options/index.ts`.

- [x] 2.6 Calculate Merge & Update results (deps: 2.2, 2.4, est: ~40m) (mutex: csv)
  - why: Refresh known IDs while preserving accounts omitted from a newer CSV.
  - acceptance: R-2.16 — WHEN an import begins, THE SYSTEM SHALL default to Merge & Update and offer Wipe & Replace as an explicit alternative.
  - acceptance: R-2.17 — WHEN the user confirms Merge & Update, THE SYSTEM SHALL add new account IDs, replace complete records for existing valid IDs, preserve absent records, and leave existing records unchanged for invalid incoming rows.
  - acceptance: R-2.18 — IF a populated catalog's normalized target rule differs from a proposed merge rule, THE SYSTEM SHALL reject the merge and require an explicit switch to Replace to change the target.
  - verify: Verify default mode, new IDs, complete record updates including removed metadata keys, identical rows, preserved absent/invalid incoming records, and rejection of cross-rule merges for nonempty catalogs.
  - landed: `4ab1acc`, `736d88c`, `2e73dd9` — `src/domain/csv.ts`, `src/domain/import.ts`, `src/domain/rules.ts`, `src/domain/domain.test.ts`, `src/domain/boundaries.test.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `src/options/index.ts`.

- [x] 2.7 Calculate Wipe & Replace results (deps: 2.2, 2.4, est: ~25m) (mutex: csv)
  - why: Make full dataset replacement deliberate and reviewable.
  - acceptance: R-2.8 — WHEN the user confirms Wipe & Replace on a current preview containing at least one valid account, THE SYSTEM SHALL atomically replace accounts with the valid rows and confirmed target rule in one encrypted snapshot.
  - verify: Verify valid-row-only candidate snapshot, removal counts, and no mutation before explicit current-preview confirmation; persist through story 2.8.
  - landed: `4ab1acc`, `736d88c`, `2e73dd9` — `src/domain/csv.ts`, `src/domain/import.ts`, `src/domain/rules.ts`, `src/domain/domain.test.ts`, `src/domain/boundaries.test.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `src/options/index.ts`.

- [x] 2.8 Commit validated imports as one transaction (deps: 1.5, 2.3, 2.5, est: ~65m) (mutex: vault)
  - why: Keep accounts and their target binding consistent even when input or browser state changes.
  - acceptance: R-2.9 — IF the preview has zero valid accounts, or import is cancelled, locked, stale, or fails encryption/storage, THE SYSTEM SHALL preserve the previous account database.
  - acceptance: R-2.13 — WHEN import commits, THE SYSTEM SHALL persist the confirmed catalog rule and rule revision atomically with accounts and resulting history inside the encrypted snapshot.
  - acceptance: R-2.14 — IF import is cancelled or fails validation, encryption, or storage, THE SYSTEM SHALL preserve both the previous account catalog and its URL binding.
  - acceptance: R-2.20 — WHEN the file, target rule, mode, or snapshot revision changes, THE SYSTEM SHALL invalidate the preview and require fresh validation before commit.
  - verify: Bind previews to file/rule/mode/snapshot; invalidate edits/stale previews; verify atomic encrypted accounts/rule/history persistence and unchanged prior data on zero-valid-row, cancellation, lock, encryption, or storage failure.
  - landed: `4ab1acc`, `736d88c`, `2e73dd9` — `src/domain/csv.ts`, `src/domain/import.ts`, `src/domain/rules.ts`, `src/domain/domain.test.ts`, `src/domain/boundaries.test.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `src/options/index.ts`.

- [x] 2.9 Reconcile history and profile approval after imports (deps: 2.8, 3.4, est: ~40m) (mutex: vault)
  - why: Prevent old account history or permissions from implying a new target is ready.
  - acceptance: R-2.10 — WHEN an import succeeds, THE SYSTEM SHALL increment the catalog revision, cancel pending login attempts and Undo, remove history references to absent IDs, clear last-successful references whose credentials changed, and clear all history and profile approval if the target rule changes.
  - acceptance: R-2.15 — IF the imported rule changes or no complete approved profile exists, THE SYSTEM SHALL finish the valid import, present a Configure login fields for this URL action, and withhold autofill until a matching exact login profile is saved and authorized for the current rule revision.
  - verify: Test changed credentials clearing successful attribution, deleted IDs pruning history, rule changes clearing history/approval, attempt and Undo invalidation, and successful import followed by profile-setup guidance.
  - landed: `4ab1acc`, `736d88c`, `2e73dd9` — `src/domain/csv.ts`, `src/domain/import.ts`, `src/domain/rules.ts`, `src/domain/domain.test.ts`, `src/domain/boundaries.test.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `src/options/index.ts`.

## Unit 3: Authorized login profile

- [x] 3.1 Configure one exact login profile (deps: 2.4, 9.1, est: ~45m) (mutex: profile)
  - why: Make field selection and success evidence explicit for the authorized application.
  - acceptance: R-3.1 — THE SYSTEM SHALL support one configurable profile containing name, HTTPS login route, username/password CSS selectors, and either a success route or a visible-element selector on a success route.
  - acceptance: R-3.2 — IF profile URLs contain userinfo, wildcards, non-HTTPS schemes, or different origins, THE SYSTEM SHALL reject the profile.
  - acceptance: R-3.3 — WHEN evaluating a route, THE SYSTEM SHALL compare parsed origin including port, exact pathname, and exact hash while ignoring query parameters.
  - acceptance: R-3.4 — IF URL-only success equals the login route, THE SYSTEM SHALL reject that success configuration.
  - verify: Exercise profile editor and URL validation for origin/port/path/hash, trailing slash, query handling, prohibited wildcard/profile schemes, same-origin success, and refusal of identical URL-only login/success routes.
  - landed: `4ab1acc`, `736d88c`, `2e73dd9` — `src/domain/rules.ts`, `src/domain/domain.test.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `src/options/index.ts`, `public/manifest.json`.

- [x] 3.2 Authorize only the selected host (deps: 3.1, 1.4, est: ~45m) (mutex: profile)
  - why: Request only the browser access needed for the user's chosen application.
  - acceptance: R-3.5 — WHEN the user saves and authorizes a profile, THE SYSTEM SHALL request permission only for its HTTPS origin and register top-frame isolated content scripts scoped to that origin.
  - acceptance: R-3.6 — THE SYSTEM SHALL request only storage, scripting, activeTab, alarms, and runtime-selected optional host permission necessary for the documented MVP.
  - verify: Inspect manifest permissions; test grant/deny and narrow runtime origin requests, top-frame isolated dynamic registration, worker restart reconciliation, and Chrome match-pattern conversion for explicit ports.
  - landed: `4ab1acc`, `736d88c`, `2e73dd9` — `src/domain/rules.ts`, `src/domain/domain.test.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `src/options/index.ts`, `public/manifest.json`.

- [x] 3.3 Keep content scripts inert outside configured routes (deps: 3.2, est: ~35m) (mutex: content)
  - why: Prevent a broad host permission from becoming arbitrary-page form inspection.
  - acceptance: R-3.7 — WHERE a document is outside the configured login and success routes, THE SYSTEM SHALL perform no credential field detection, filling, or authenticated-element inspection.
  - verify: Instrument unrelated same-origin routes and ungranted origins; verify no credential-field or authenticated-element queries occur outside the exact configured routes.
  - landed: `4ab1acc`, `736d88c`, `2e73dd9` — `src/domain/rules.ts`, `src/domain/domain.test.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `src/options/index.ts`, `public/manifest.json`.

- [x] 3.4 Revalidate profile approval and permission changes (deps: 3.2, 3.3, est: ~40m) (mutex: profile)
  - why: Disable stale configurations before they can deliver credentials.
  - acceptance: R-3.8 — WHEN the profile changes or permission is removed, THE SYSTEM SHALL invalidate attempts and disable obsolete profile activity.
  - acceptance: R-3.9 — IF authorization is denied or required selectors/configuration are invalid, THE SYSTEM SHALL keep autofill unavailable and display an actionable safe error.
  - acceptance: R-3.10 — IF a proposed exact profile login URL does not satisfy the catalog rule, THE SYSTEM SHALL reject activation and explain that changing the catalog target requires a new import; WHEN an approved profile is saved, THE SYSTEM SHALL bind its approval to the current catalog-rule revision.
  - verify: Change profile/rule revision, revoke permission, deny reauthorization, and enter invalid selectors; verify attempts invalidate and autofill remains unavailable until valid reviewed configuration is restored.
  - landed: `4ab1acc`, `736d88c`, `2e73dd9` — `src/domain/rules.ts`, `src/domain/domain.test.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `src/options/index.ts`, `public/manifest.json`.

## Unit 4: Account search and confirmation

- [x] 4.1 Search all non-secret account fields (deps: 1.4, est: ~40m) (mutex: search)
  - why: Find accounts by combined metadata without making passwords discoverable.
  - acceptance: R-4.1 — WHILE unlocked, THE SYSTEM SHALL search account IDs, usernames, and every metadata name/value using NFKC-normalized case-insensitive substring matching.
  - acceptance: R-4.2 — WHEN a query contains whitespace-separated terms, THE SYSTEM SHALL return only accounts for which every term matches at least one indexed field.
  - acceptance: R-4.3 — THE SYSTEM SHALL exclude passwords from searchable content, summaries, snippets, ordering, diagnostics, and copy actions. This is the proposed exception to the source brief requiring spec approval.
  - verify: Test NFKC/case normalization, multi-token AND across separate fields, metadata names/values, substrings, empty queries, and password-only queries returning no secret-derived matches.
  - landed: `4ab1acc`, `736d88c`, `2e73dd9`, `f9963bc` — `src/domain/search.ts`, `src/domain/domain.test.ts`, `src/background/service.ts`, `src/popup/index.ts`, `src/ui/common.ts`, `tests/browser/run.mjs`, `docs/verification/browser-report.json`.

- [x] 4.2 Provide stable paginated results (deps: 4.1, est: ~20m) (mutex: search)
  - why: Keep large result sets readable and repeatable.
  - acceptance: R-4.4 — WHEN displaying results, THE SYSTEM SHALL use stable account-ID order, paginate at 50 records, and display the total match count.
  - verify: Verify ID ordering, 50-row pages, accurate total count, last-page boundaries, and pagination reset when filters or catalog data change.
  - landed: `4ab1acc`, `736d88c`, `2e73dd9`, `f9963bc` — `src/domain/search.ts`, `src/domain/domain.test.ts`, `src/background/service.ts`, `src/popup/index.ts`, `src/ui/common.ts`, `tests/browser/run.mjs`, `docs/verification/browser-report.json`.

- [x] 4.3 Confirm selection and support direct last-successful fill (deps: 4.2, 5.5, 6.6, est: ~35m) (mutex: popup)
  - why: Reduce wrong-account actions while retaining the fast known-account workflow.
  - acceptance: R-4.5 — WHEN the user selects a result, THE SYSTEM SHALL show its account ID, username, and metadata for confirmation without filling until the user activates Autofill.
  - acceptance: R-4.6 — WHEN Use this account is activated on the last-successful card, THE SYSTEM SHALL initiate the same validated autofill protocol directly.
  - verify: Select a result and confirm no credentials change until Autofill; activate the featured account and verify it uses the same protected fill command.
  - landed: `4ab1acc`, `736d88c`, `2e73dd9`, `f9963bc` — `src/domain/search.ts`, `src/domain/domain.test.ts`, `src/background/service.ts`, `src/popup/index.ts`, `src/ui/common.ts`, `tests/browser/run.mjs`, `docs/verification/browser-report.json`.

- [x] 4.4 Render safe account views and locked states (deps: 4.2, 1.5, 8.1, est: ~35m) (mutex: popup)
  - why: Make account information usable without rendering imported HTML or exposing it while locked.
  - acceptance: R-4.7 — THE SYSTEM SHALL render imported content as inert text and provide keyboard-operable controls and explicit empty, loading, locked, unsupported-site, and error states.
  - acceptance: R-4.8 — WHILE locked, THE SYSTEM SHALL withhold accounts, search results, history details, and autofill capability.
  - verify: Use hostile metadata and long text; verify inert rendering, keyboard control, loading/empty/disallowed/error feedback, and removal of summaries/counts/history after lock.
  - landed: `4ab1acc`, `736d88c`, `2e73dd9`, `f9963bc` — `src/domain/search.ts`, `src/domain/domain.test.ts`, `src/background/service.ts`, `src/popup/index.ts`, `src/ui/common.ts`, `tests/browser/run.mjs`, `docs/verification/browser-report.json`.

- [x] 4.5 Measure full-size catalog search performance (deps: 4.2, 8.2, est: ~30m) (mutex: search)
  - why: Verify the promised account-finding experience on a realistic upper-bound catalog.
  - acceptance: R-4.9 — THE SYSTEM SHALL target search responses within 200 ms after the final keystroke for the 10,000-account acceptance dataset and report the measured result and machine used.
  - verify: Measure end-to-end response after final keystroke for 10,000 synthetic accounts; report machine, dataset, timing method, and result against 200 ms, then address any observed bottleneck.
  - landed: `4ab1acc`, `736d88c`, `2e73dd9`, `f9963bc` — `src/domain/search.ts`, `src/domain/domain.test.ts`, `src/background/service.ts`, `src/popup/index.ts`, `src/ui/common.ts`, `tests/browser/run.mjs`, `docs/verification/browser-report.json`.

## Unit 5: Explicit credential autofill

- [x] 5.1 Authorize typed autofill requests at the worker boundary (deps: 1.5, 3.4, 2.9, est: ~55m) (mutex: worker)
  - why: Keep untrusted pages and stale extension views from requesting credentials.
  - acceptance: R-5.1 — WHEN an autofill action is requested, THE SYSTEM SHALL validate the trusted extension-page sender, unlocked session, account, active tab, permission, current approved catalog-rule revision, current-page match against both the catalog rule and exact profile login route, and current top-frame document.
  - acceptance: R-5.8 — THE SYSTEM SHALL reject unrecognized runtime messages and page-originated or external credential requests.
  - verify: Send malformed, external, content-script-forged, locked, stale-rule, wrong-tab, and unauthorized-route messages; verify rejection before credential lookup/delivery.
  - landed: `6224abb`, `736d88c`, `2e73dd9`, `f9963bc` — `src/content/fields.ts`, `src/content/fields.test.ts`, `src/content/index.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `src/popup/index.ts`, `tests/browser/run.mjs`.

- [x] 5.2 Validate both target inputs before writing (deps: 3.3, est: ~40m) (mutex: content)
  - why: Avoid sending credentials to hidden, ambiguous, or unsupported fields.
  - acceptance: R-5.2 — IF either selector fails to resolve to exactly one distinct visible enabled writable supported input, or a form explicitly targets another origin, THE SYSTEM SHALL reject autofill before writing credentials.
  - acceptance: R-5.3 — THE SYSTEM SHALL support text/email username inputs and password-type password inputs only in the top-level light DOM.
  - verify: Browser fixtures cover duplicate/absent/swapped fields, hidden/disabled/read-only controls, text/email versus unsupported username types, iframes/shadow roots, and explicit cross-origin form actions.
  - landed: `6224abb`, `736d88c`, `2e73dd9`, `f9963bc` — `src/content/fields.ts`, `src/content/fields.test.ts`, `src/content/index.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `src/popup/index.ts`, `tests/browser/run.mjs`.

- [x] 5.3 Fill the validated document and acknowledge retained values (deps: 5.1, 5.2, est: ~60m) (mutex: content)
  - why: Deliver one chosen credential pair to the intended document reliably.
  - acceptance: R-5.4 — WHEN credentials are delivered, THE SYSTEM SHALL target the validated document ID and revalidate URL and fields immediately before assigning values.
  - acceptance: R-5.5 — WHEN filling supported inputs, THE SYSTEM SHALL use native setters and input/change events, verify retained values, and return a credential-free acknowledgement.
  - verify: Test document-targeted delivery, navigation between inspection and delivery, repeated route/field validation, native setters and input/change events, framework-controlled inputs, and secret-free acknowledgements.
  - landed: `6224abb`, `736d88c`, `2e73dd9`, `f9963bc` — `src/content/fields.ts`, `src/content/fields.test.ts`, `src/content/index.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `src/popup/index.ts`, `tests/browser/run.mjs`.

- [x] 5.4 Preserve manual login and secret boundaries (deps: 5.3, est: ~25m) (mutex: content)
  - why: Keep form submission under user control and passwords out of extension surfaces.
  - acceptance: R-5.6 — THE SYSTEM SHALL never click Login, submit a form, display plaintext passwords, or expose an API that lets a content script enumerate accounts or request arbitrary credentials.
  - verify: Verify fill never submits or clicks Login; inspect extension DOM/messages for password exposure and confirm no account-enumeration or arbitrary-password content API exists.
  - landed: `6224abb`, `736d88c`, `2e73dd9`, `f9963bc` — `src/content/fields.ts`, `src/content/fields.test.ts`, `src/content/index.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `src/popup/index.ts`, `tests/browser/run.mjs`.

- [x] 5.5 Handle interrupted or partial fills (deps: 5.3, 5.4, est: ~40m) (mutex: content)
  - why: Avoid misleading success or overwriting user changes after a failed fill.
  - acceptance: R-5.7 — IF navigation, validation, or field assignment invalidates a fill, THE SYSTEM SHALL report failure, avoid updating recent/successful history, and remove any partial value still equal to what that fill wrote.
  - verify: Force a setter failure and navigation race; clear only values still equal to extension-written values, preserve subsequent user edits, and verify no recent/history update on failed acknowledgement.
  - landed: `6224abb`, `736d88c`, `2e73dd9`, `f9963bc` — `src/content/fields.ts`, `src/content/fields.test.ts`, `src/content/index.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `src/popup/index.ts`, `tests/browser/run.mjs`.

## Unit 6: Recent and last-successful accounts

- [x] 6.1 Create bounded attempts and recent-account references (deps: 5.5, est: ~40m) (mutex: history)
  - why: Distinguish selection from an acknowledged attempt and make recent accounts useful.
  - acceptance: R-6.1 — WHEN both fields are successfully acknowledged as filled, THE SYSTEM SHALL move the account ID to the front of a unique per-profile recent list limited to 10 and create an attempt expiring in two minutes.
  - acceptance: R-6.2 — WHEN an account is selected without successful fill, THE SYSTEM SHALL leave recent and last-successful history unchanged.
  - acceptance: R-6.3 — THE SYSTEM SHALL associate each pending attempt with its token, tab, originating document, profile/revision, vault revision, account ID, timestamps, and success baseline without including credentials.
  - verify: Verify two-minute attempts with tab/document/profile/catalog references, no credentials in attempt state, unique recents capped at 10, and unchanged state after selection alone.
  - landed: `6224abb`, `736d88c`, `f9963bc` — `src/content/index.ts`, `src/content/tracking.test.ts`, `src/shared/types.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `tests/browser/run.mjs`.

- [x] 6.2 Reject existing or failed success signals (deps: 6.1, est: ~25m) (mutex: history)
  - why: Prevent a failed login or already-visible marker from replacing known success.
  - acceptance: R-6.4 — IF the configured success condition is already true before fill, THE SYSTEM SHALL refuse to create an attributable attempt.
  - acceptance: R-6.8 — IF authentication fails or no qualifying success is observed, THE SYSTEM SHALL preserve the prior last-successful account.
  - verify: Test true-at-fill baseline, failed-login fixtures, and timeout without a qualifying transition; verify prior successful ID/timestamp remain unchanged.
  - landed: `6224abb`, `736d88c`, `f9963bc` — `src/content/index.ts`, `src/content/tracking.test.ts`, `src/shared/types.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `tests/browser/run.mjs`.

- [x] 6.3 Validate URL and element success evidence (deps: 6.2, est: ~50m) (mutex: history)
  - why: Record success only when the configured current-document evidence is observed.
  - acceptance: R-6.5 — WHEN the configured success condition becomes true after an acknowledged fill, THE SYSTEM SHALL validate the current top-frame observation, unexpired current attempt, unlocked session, matching revisions, and existing account before committing its ID as last successful.
  - acceptance: R-6.6 — WHERE success is element-based, THE SYSTEM SHALL require a visible matching element on the configured route and revalidate it in the current document.
  - verify: Test URL transition, visible versus hidden markers, wrong route, stale document, forged observations, expired attempts, and removed accounts; re-probe before accepting element evidence.
  - landed: `6224abb`, `736d88c`, `f9963bc` — `src/content/index.ts`, `src/content/tracking.test.ts`, `src/shared/types.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `tests/browser/run.mjs`.

- [x] 6.4 Resume tracking through navigation and worker suspension (deps: 6.3, est: ~55m) (mutex: history)
  - why: Support common full-page and single-page login flows.
  - acceptance: R-6.7 — THE SYSTEM SHALL support authorized full-page and same-document success transitions, including worker suspension between fill and observation.
  - verify: Run full navigation, history/hash transitions, worker suspension/resume, new-document handshake, and bounded observer cleanup fixtures with no dependency on popup lifetime.
  - landed: `6224abb`, `736d88c`, `f9963bc` — `src/content/index.ts`, `src/content/tracking.test.ts`, `src/shared/types.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `tests/browser/run.mjs`.

- [x] 6.5 Cancel superseded and invalidated attempts (deps: 6.1, 3.4, est: ~35m) (mutex: history)
  - why: Ensure a later user action or catalog change cannot be attributed to an earlier account.
  - acceptance: R-6.9 — WHEN another acknowledged fill occurs in the same tab, THE SYSTEM SHALL supersede that tab's older attempt.
  - acceptance: R-6.10 — WHEN input values are edited on the login page, the tab closes, the attempt expires, the profile/vault changes, permission is revoked, the vault locks, or navigation leaves the configured routes, THE SYSTEM SHALL cancel attribution.
  - verify: Test a second fill, input edits, tab closure, expiry, profile/account mutation, permission removal, lock, and off-route navigation; verify old tokens cannot commit.
  - landed: `6224abb`, `736d88c`, `f9963bc` — `src/content/index.ts`, `src/content/tracking.test.ts`, `src/shared/types.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `tests/browser/run.mjs`.

- [x] 6.6 Persist success history without losing concurrent observations (deps: 6.4, 6.5, est: ~45m) (mutex: vault)
  - why: Keep the featured account accurate across tabs and credential updates.
  - acceptance: R-6.11 — WHEN success commits, THE SYSTEM SHALL consume the attempt and persist only the account ID reference in encrypted history rather than a separate password.
  - acceptance: R-6.12 — WHEN multiple tabs report valid successes, THE SYSTEM SHALL serialize commits in observation order and reject stale references before writing.
  - acceptance: R-6.13 — WHEN success commits, THE SYSTEM SHALL persist its observed timestamp with the account reference, display a time only when available, and clear that time whenever the corresponding reference is removed.
  - verify: Test reference/timestamp-only encrypted history, token consumption, independent tab successes in observation order, catalog versus snapshot revisions, missing timestamps, and reference deletion.
  - landed: `6224abb`, `736d88c`, `f9963bc` — `src/content/index.ts`, `src/content/tracking.test.ts`, `src/shared/types.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `tests/browser/run.mjs`.

## Unit 7: Delivery and verification

- [x] 7.1 Package the extension and user instructions (deps: 7.2, est: ~40m) (mutex: delivery)
  - why: Provide a reproducible installation and an honest account of verified behavior.
  - acceptance: R-7.1 — THE SYSTEM SHALL provide reproducible build instructions, an unpacked extension output, profile/import/unlock instructions, and a synthetic example CSV in the implementation deliverable.
  - acceptance: R-7.4 — IF the real application's profile has not been configured and exercised, THE SYSTEM SHALL describe real-site compatibility as unverified rather than claim successful integration.
  - verify: Build from pinned dependencies; inspect unpacked output; follow setup/import/profile/unlock instructions using a synthetic CSV; document restrictions, test evidence, and real-site compatibility as pending until configured.
  - landed: `6241465`, `f9963bc` — `scripts/build.mjs`, `package-lock.json`, `tests/browser/run.mjs`, `README.md`, `examples/accounts.csv`, `docs/verification/account-login-assistant.md`, `docs/verification/browser-report.json`.

- [x] 7.2 Run the integrated browser and security acceptance checks (deps: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 7.3, 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, est: ~90m) (mutex: tests)
  - why: Validate the complete workflow at the boundaries where unit checks are insufficient.
  - acceptance: R-7.2 — THE SYSTEM SHALL be verified with domain tests and browser scenarios for import failure, unauthorized routes, credential handling, failed/successful login, navigation races, worker suspension, permission removal, lock expiry, and concurrent tabs.
  - verify: Use an isolated extension-capable Chrome/Chromium profile and controlled HTTPS fixtures; run import/search/fill/manual submit/success, failure, lifecycle, concurrent-tab, permission, hostile-content, Undo/purge, and navigation-race scenarios. Inspect persistent storage/network behavior, compare both UI references, and record actual results without claiming unrun tests.
  - landed: `6241465`, `f9963bc` — `scripts/build.mjs`, `package-lock.json`, `tests/browser/run.mjs`, `README.md`, `examples/accounts.csv`, `docs/verification/account-login-assistant.md`, `docs/verification/browser-report.json`.

- [x] 7.3 Keep development fixtures and diagnostics secret-free (deps: 1.1, est: ~25m) (mutex: tests)
  - why: Prevent verification and error reporting from leaking actual credentials.
  - acceptance: R-7.3 — THE SYSTEM SHALL keep secrets out of logs, errors, telemetry, screenshots, and test artifacts, using synthetic credentials in fixtures.
  - verify: Use synthetic-only fixtures, safe diagnostic structures, no raw parsed-row logging, and artifact checks that exclude credential values from screenshots/errors/reports.
  - landed: `6241465`, `f9963bc` — `scripts/build.mjs`, `package-lock.json`, `tests/browser/run.mjs`, `README.md`, `examples/accounts.csv`, `docs/verification/account-login-assistant.md`, `docs/verification/browser-report.json`.

## Unit 8: Supplied popup style

- [x] 8.1 Build the popup shell from the supplied visual reference (deps: 1.1, est: ~55m) (mutex: popup)
  - why: Preserve the user's chosen look in the actual extension viewport.
  - acceptance: R-8.1 — THE SYSTEM SHALL use the supplied screen.png and code.html light slate/white/indigo visual style, taking precedence over the conflicting dark palette in DESIGN.md.
  - acceptance: R-8.2 — THE SYSTEM SHALL present the reference's compact branded header, authorized-profile strip, featured account card, search, rounded account rows, and count/Lock footer using the tokens defined in the LLD.
  - acceptance: R-8.3 — THE SYSTEM SHALL target a 380px-wide popup with height capped at the smaller of 600px and the available viewport, with accessible internal vertical scrolling, excluding the reference's outer presentation canvas and fixed 884px minimum height.
  - acceptance: R-8.4 — THE SYSTEM SHALL load popup styles, fonts, icons, and scripts from packaged local assets without runtime CDN, Google Fonts, or inline demo scripts.
  - verify: Compare synthetic reference state to screen.png: light surfaces, indigo CTA, header/strip/card/list/footer, typography and spacing; verify 380px width/600px cap, scroll behavior, packaged assets, and no CDN requests.
  - landed: `2e73dd9`, `f9963bc` — `src/popup/index.ts`, `src/ui/common.ts`, `src/ui/common.test.ts`, `public/popup.html`, `public/ui.css`, `tests/browser/run.mjs`.

- [x] 8.2 Connect popup sections to live account and history state (deps: 4.3, 4.4, 6.6, est: ~35m) (mutex: popup)
  - why: Replace reference placeholders with truthful authorized/last-successful/recent/search states.
  - acceptance: R-8.5 — WHEN rendering accounts, badges, counts, timestamps, and authorization indicators, THE SYSTEM SHALL derive them from actual vault/profile/tab state rather than reference placeholders.
  - acceptance: R-8.6 — THE SYSTEM SHALL label last-successful history distinctly from recent accounts and search results, preserving selection confirmation before autofill for list results.
  - verify: Exercise no-history, populated, filtered, unauthorized, and changed-vault cases; verify counts/timestamps and independent labels reflect data without conflating filled and authenticated.
  - landed: `2e73dd9`, `f9963bc` — `src/popup/index.ts`, `src/ui/common.ts`, `src/ui/common.test.ts`, `public/popup.html`, `public/ui.css`, `tests/browser/run.mjs`.

- [x] 8.3 Implement only truthful keyboard hints and controls (deps: 8.1, 4.4, est: ~20m) (mutex: popup)
  - why: Make compact controls discoverable without advertising unsupported actions.
  - acceptance: R-8.7 — WHEN the user presses / while unlocked and focus is outside editable controls with no modifier keys, THE SYSTEM SHALL focus the search field.
  - acceptance: R-8.8 — IF a displayed shortcut or action has no implemented behavior, THE SYSTEM SHALL omit it rather than present a decorative functional control.
  - verify: Test slash focus outside editables, modifiers, locked state, tab order, clear-search, and removal of the unimplemented global shortcut/copy placeholder.
  - landed: `2e73dd9`, `f9963bc` — `src/popup/index.ts`, `src/ui/common.ts`, `src/ui/common.test.ts`, `public/popup.html`, `public/ui.css`, `tests/browser/run.mjs`.

- [x] 8.4 Show actual fill and lock completion (deps: 8.2, 1.5, est: ~20m) (mutex: popup)
  - why: Avoid showing successful outcomes before background operations finish.
  - acceptance: R-8.9 — WHEN a fill or lock operation completes, THE SYSTEM SHALL show completion only after the corresponding real acknowledgement, without equating filled fields to authenticated login.
  - verify: Delay or fail worker acknowledgements; verify loading/error/complete states and the explicit manual-Login instruction only after successful fill.
  - landed: `2e73dd9`, `f9963bc` — `src/popup/index.ts`, `src/ui/common.ts`, `src/ui/common.test.ts`, `public/popup.html`, `public/ui.css`, `tests/browser/run.mjs`.

- [x] 8.5 Check every popup state for usability and visual fidelity (deps: 8.3, 8.4, est: ~35m) (mutex: popup)
  - why: Maintain the reference quality when data or application state differs from the sample.
  - acceptance: R-8.10 — THE SYSTEM SHALL apply the supplied style to locked, empty, unauthorized, loading, error, and confirmation states with visible focus, accessible labels, reduced-motion support, and usable long-content layouts.
  - verify: Inspect locked, empty, unauthorized, loading, error, confirmation, and long-content views at 360/380/420px; test keyboard, accessible names, focus visibility, increased text size, and reduced motion.
  - landed: `2e73dd9`, `f9963bc` — `src/popup/index.ts`, `src/ui/common.ts`, `src/ui/common.test.ts`, `public/popup.html`, `public/ui.css`, `tests/browser/run.mjs`.

## Unit 9: Settings page and account management

- [x] 9.1 Build the settings shell and navigation (deps: 8.1, est: ~50m) (mutex: options)
  - why: Provide a coherent home for import and account management in the second supplied design.
  - acceptance: R-9.1 — THE SYSTEM SHALL reproduce the light settings reference from stitch_account_login_assistant_extension-2 with its import panel, file card, URL field/shortcuts, mode switch, searchable account list, local-encryption notice, usage footer, and Back/Done controls.
  - acceptance: R-9.18 — THE SYSTEM SHALL implement settings controls with packaged scripts/assets, accessible focus and labels, truthful status messages, a panel capped at the smaller of 600px and the available viewport with internal scrolling and visible header/footer, and zoom, without executing the reference's inline demos or loading its CDN resources.
  - acceptance: R-9.19 — WHEN Back or Done is activated, THE SYSTEM SHALL return to the settings overview or close its extension-created management tab and focus the source tab if available, without claiming to reopen the browser popup.
  - verify: Compare the light settings reference with local assets; verify source-tab versus directly opened Back/Done behavior, ordinary scrolling/zoom, safe inline statuses, and access to setup/profile editor.
  - landed: `736d88c`, `2e73dd9`, `f9963bc` — `src/options/index.ts`, `src/ui/common.ts`, `src/ui/common.test.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `public/options.html`, `public/ui.css`, `tests/browser/run.mjs`.

- [x] 9.2 Connect file selection and the two-step import review (deps: 9.1, 2.9, est: ~35m) (mutex: options)
  - why: Make the required file/URL/mode/preview sequence usable end to end.
  - acceptance: R-9.2 — WHEN the user selects or changes a file, THE SYSTEM SHALL show its actual name, byte size, and validation state and discard stale preview results.
  - acceptance: R-9.3 — THE SYSTEM SHALL separate file/rule/mode selection from validation review and commit as two visible import stages.
  - verify: Select/change files, show actual metadata and validation, switch modes, edit URL after preview, and commit through the repository; verify stale previews and failures cannot masquerade as success.
  - landed: `736d88c`, `2e73dd9`, `f9963bc` — `src/options/index.ts`, `src/ui/common.ts`, `src/ui/common.test.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `public/options.html`, `public/ui.css`, `tests/browser/run.mjs`.

- [x] 9.3 Provide URL presets and the explicit Active Tab shortcut (deps: 9.1, 2.4, 3.2, est: ~30m) (mutex: options)
  - why: Reduce URL typing without silently granting authorization.
  - acceptance: R-9.4 — WHEN a URL preset or Active Tab shortcut is selected, THE SYSTEM SHALL populate the input for review without automatically importing, saving a rule, or granting host permission.
  - acceptance: R-9.5 — IF a permitted HTTPS source tab cannot be read, THE SYSTEM SHALL disable Active Tab with an actionable explanation and allow manual URL entry without requesting broad tabs permission.
  - acceptance: R-9.6 — THE SYSTEM SHALL derive preset chips from configured catalog/profile values and account authorization-domain labels from the one catalog rule, never from illustrative domains or arbitrary CSV metadata.
  - verify: Verify real configured presets, readable original HTTPS tab, closed/navigated/inaccessible/direct-open cases, and no broad tabs permission; prove shortcut clicks only populate the field.
  - landed: `736d88c`, `2e73dd9`, `f9963bc` — `src/options/index.ts`, `src/ui/common.ts`, `src/ui/common.test.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `public/options.html`, `public/ui.css`, `tests/browser/run.mjs`.

- [x] 9.4 Show a searchable stored-account catalog (deps: 9.1, 4.2, 2.9, est: ~30m) (mutex: options)
  - why: Allow users to inspect the dataset they are about to maintain.
  - acceptance: R-9.7 — WHEN filtering stored accounts, THE SYSTEM SHALL apply the popup's non-password search semantics and pagination and distinguish filtered counts from the total catalog count.
  - verify: Verify filter semantics, pagination, safe summaries, total versus filtered count, catalog-origin labels, and no password rendering.
  - landed: `736d88c`, `2e73dd9`, `f9963bc` — `src/options/index.ts`, `src/ui/common.ts`, `src/ui/common.test.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `public/options.html`, `public/ui.css`, `tests/browser/run.mjs`.

- [x] 9.5 Delete an account through the encrypted repository (deps: 9.4, 1.5, est: ~35m) (mutex: vault)
  - why: Remove obsolete accounts without leaving history or pending attempts pointing to them.
  - acceptance: R-9.8 — WHEN the user deletes an account, THE SYSTEM SHALL atomically remove it, prune its history, increment the catalog revision, cancel pending attempts, and show completion only after persistence succeeds.
  - verify: Delete a recent/last-successful record; verify committed removal, history pruning, revision increment, attempt cancellation, and unchanged data/UI on storage failure.
  - landed: `736d88c`, `2e73dd9`, `f9963bc` — `src/options/index.ts`, `src/ui/common.ts`, `src/ui/common.test.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `public/options.html`, `public/ui.css`, `tests/browser/run.mjs`.

- [x] 9.6 Restore a deletion through bounded encrypted Undo (deps: 9.5, est: ~55m) (mutex: vault)
  - why: Give users a brief recovery window without resurrecting stale credentials.
  - acceptance: R-9.9 — WHEN individual deletion succeeds, THE SYSTEM SHALL offer a single 30-second Undo opportunity backed by an encrypted session tombstone bound to the post-delete snapshot revision, catalog rule, session generation, and expiry.
  - acceptance: R-9.10 — WHEN a valid Undo is activated, THE SYSTEM SHALL atomically restore the deleted account without restoring old history, consume the Undo token, and refresh affected views.
  - acceptance: R-9.11 — IF Undo expires or its session, rule, or snapshot changes, THE SYSTEM SHALL reject restoration and remove the actionable Undo control with an explanatory status.
  - verify: Test 30-second expiry, restoration without old history, encrypted session tombstone, worker suspension, lock, second delete, import/purge/history write, profile edits, and revision mismatch; confirm token consumption.
  - landed: `736d88c`, `2e73dd9`, `f9963bc` — `src/options/index.ts`, `src/ui/common.ts`, `src/ui/common.test.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `public/options.html`, `public/ui.css`, `tests/browser/run.mjs`.

- [x] 9.7 Purge accounts with an explicit total-count confirmation (deps: 9.5, est: ~30m) (mutex: vault)
  - why: Make bulk removal deliberate while keeping setup ready for reuse.
  - acceptance: R-9.12 — WHEN Purge All is selected, THE SYSTEM SHALL ask for explicit confirmation displaying the entire catalog count regardless of the current filter and state that purge cannot be undone.
  - acceptance: R-9.13 — WHEN purge is confirmed, THE SYSTEM SHALL atomically empty accounts/history, invalidate Undo and attempts, and preserve initialized vault setup, catalog rule, and profile settings; WHEN cancelled, THE SYSTEM SHALL leave all data unchanged.
  - verify: Filter the list, invoke purge, cancel then confirm; verify total-count wording, no Undo, empty accounts/history, cleared attempts/tombstone, preserved profile/vault/rule, and no resurrection on unlock.
  - landed: `736d88c`, `2e73dd9`, `f9963bc` — `src/options/index.ts`, `src/ui/common.ts`, `src/ui/common.test.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `public/options.html`, `public/ui.css`, `tests/browser/run.mjs`.

- [x] 9.8 Synchronize management views and handle locked/stale operations (deps: 9.2, 9.6, 9.7, 1.5, est: ~40m) (mutex: options)
  - why: Keep multiple open views consistent with committed data and lock state.
  - acceptance: R-9.14 — IF any account-management write fails or becomes stale, THE SYSTEM SHALL preserve the last committed snapshot and report a safe error instead of simulating success.
  - acceptance: R-9.15 — WHEN committed data changes, THE SYSTEM SHALL refresh account/search counts, history, storage usage, and relevant open extension views from the committed state.
  - acceptance: R-9.17 — WHILE locked, THE SYSTEM SHALL withhold account details and counts and disable import, delete, Undo, and purge until unlock.
  - verify: Open popup/options together; race import/delete/history/lock, inject storage failures, and verify counts/results/status updates derive from committed data while locked views reveal no account details.
  - landed: `736d88c`, `2e73dd9`, `f9963bc` — `src/options/index.ts`, `src/ui/common.ts`, `src/ui/common.test.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `public/options.html`, `public/ui.css`, `tests/browser/run.mjs`.

- [x] 9.9 Display real storage usage and extension version (deps: 9.8, est: ~20m) (mutex: options)
  - why: Make the reference's capacity and version indicators meaningful.
  - acceptance: R-9.16 — THE SYSTEM SHALL display actual serialized encrypted-envelope usage against the 5 MiB product vault limit and the installed extension version, without placeholder totals or claims about Chrome's total quota.
  - verify: Compare displayed MiB against actual serialized encrypted-envelope UTF-8 bytes after import/delete/purge; verify manifest version, product-limit wording, and no placeholder readiness claims.
  - landed: `736d88c`, `2e73dd9`, `f9963bc` — `src/options/index.ts`, `src/ui/common.ts`, `src/ui/common.test.ts`, `src/background/service.ts`, `src/background/service.test.ts`, `public/options.html`, `public/ui.css`, `tests/browser/run.mjs`.

## Plan integrity

52 stories cover all 104 EARS requirements exactly once as primary acceptance criteria. Every dependency names a story in this file; the dependency graph is acyclic. All 52 stories are checked with actual landed commits and produced files. Focused and integrated evidence is recorded in the verification report; its limitations are part of delivery.

## Review status

Implementation is complete under the invoked uncle-dev build workflow with the requested domain, backend, and UI subagents. All changes are committed locally. Any future behavior change first updates HLD/LLD/EARS, then the affected tasks. Configure and validate the actual website before treating its integration as verified.

