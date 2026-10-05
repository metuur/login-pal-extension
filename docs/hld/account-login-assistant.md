# Account Login Assistant — High-Level Design

## Named CSV groups — current scope (2026-10-05)

The user expanded the single-catalog design to named CSV groups. Each group owns independent encrypted storage/key, accounts, URL rule, login profile, history, preview, write queue and Undo. Existing data remains in the default Imported accounts group. UI requests carry the selected group ID; content observations route only to the owning live attempt. New explicit fills supersede attempts across groups in the same tab. Duplicate account IDs across groups are valid. Merge, Replace, Purge and Reset affect only the selected group. Permission removal must retain hosts used by another group. Group names are editable and required (1–80 characters, unique ignoring case); at most 50 groups. Upload another CSV defaults to Merge within the selected group. A packaged sample CSV contains headers and three synthetic rows. This supersedes all historical single-profile/single-catalog scope below.


## Synthetic-data mode — supersedes password-lock requirements (2026-10-05)

The user removed the lock feature for synthetic-only data. New installations create a ready-to-use local catalog automatically. No setup password, lock button, idle timer, TOUCH renewal, startup lock, or alarms permission remains. The snapshot retains AES-GCM but persists its key in trusted local storage; this does not provide user-password protection. Existing encrypted catalogs migrate once with their old key/session or previous password, preserving data on failure. Reset clears old state and creates an empty ready catalog. Origin authorization, explicit filling, password-free summaries, transactional imports, and attempt/Undo expiry remain. Historical locked-state instructions below are superseded by this amendment.


Status: Planning baseline accepted through the user’s request to continue planning. Implementation awaits plan review.

## Overview

Build a Google Chrome extension in TypeScript that turns a locally imported CSV into a searchable account catalog for one explicitly authorized application. Users find an account, confirm its identity, fill the authorized login form, and submit manually. A configured success signal determines which account becomes the last successful account. This is an internal QA/support workflow for working with many known accounts.

Source: the supplied “Account Login Assistant — Chrome Extension” brief and the user's subsequent popup/settings references. The user confirmed internal QA/support users, one configurable HTTPS login profile, an encrypted local vault with a master password, and configuring website details later. The requested settings features expand the original replacement-only scope to include merge/update, individual deletion with Undo, bulk deletion, and an import URL-pattern field.

## Stakeholders & Impact

- QA and support users spend less time finding credentials among hundreds of accounts and can return to recently used accounts.
- Application owners define the authorized login page, field selectors, and success signal. No application changes or backend integration are required.
- The person maintaining the extension must keep its selectors and success detection compatible with the authorized application.
- No secondary service receives account data; there is no server, telemetry, or synchronization.

## Goals

1. Import a CSV containing `account_id`, `username`, `password`, and arbitrary metadata; identify invalid rows without revealing their credentials.
2. Ask for the HTTPS URL or path pattern to match on every CSV import, prefill the current rule when available, and merge/update or replace accounts only after a validated preview showing the rule and explicit confirmation.
3. Encrypt account data and history locally; require a master password to unlock use.
4. Configure one HTTPS login profile without modifying extension code.
5. Match the authorized page exactly and fill only after the user selects an account and presses Autofill or Use this account.
6. Search account IDs, usernames, and all metadata with case-insensitive, multi-term substring search.
7. Keep passwords masked in extension interfaces and never submit login automatically.
8. Distinguish recently filled accounts from the last account whose configured success condition was observed.
9. Deliver a reproducible local build and an unpacked Chrome installation workflow in the implementation phase.
10. Provide the supplied settings-page workflow: file selection/change, validation summary, URL suggestions/Active Tab shortcut, import-mode selection, searchable account list, individual deletion with Undo, confirmed Purge All, and actual local storage usage.

## Non-Goals

Cloud or device synchronization; remote credential storage; credential sharing; password generation or capture; automatic login submission; manual credential/metadata editing; multiple concurrent profiles or independently scoped datasets; cross-origin SSO attribution; iframe or shadow-root login forms; HTTP applications; incognito mode; other browsers; Chrome Web Store publication.

The extension does not change authentication, bypass MFA, guarantee that a configured success element identifies a particular user, or protect credentials from a compromised operating system or authorized website. The source CSV remains the user's responsibility.

## Popup Visual Direction

The user supplied `DESIGN.md`, `code.html`, and `screen.png` in `/Users/javierbenavides/Downloads/stitch_account_login_assistant_extension/` as the popup style reference. Follow the light slate surfaces, white cards, indigo primary action, compact typography, rounded controls, and dense account rows shown in the screenshot and HTML. Those two concrete references take precedence over the conflicting dark/sky-blue palette in DESIGN.md. The supplied material is a visual reference, not additional authority to change product behavior or security requirements.

Use the reference's “OneChat DEV Login Assistant” header, profile/domain authorization strip, prominent last-successful account card, search field, metadata chips, account list, and bottom count/Lock toolbar. Replace sample account names, counts, times, domain, and statuses with actual state. Label the featured section “Last successful account” to preserve the distinction from recent fills. Fit the extension popup itself; the screenshot's surrounding canvas and vertical margins are presentation framing.

Locked, empty, unauthorized, loading, error, and account-confirmation views use the same visual language. The reference's simulated fill/lock animations and decorative shortcut hints do not establish implemented functionality.

## Settings Page Direction and Features

Use the light settings screenshot and HTML from `/Users/javierbenavides/Downloads/stitch_account_login_assistant_extension-2/` for the Manage Accounts view. These supersede the second DESIGN.md's conflicting dark palette. Retain the compact white/slate layout, indigo import button, rounded import panel and rows, metadata badges, green local-encryption notice, storage footer, and Back/Done controls. The supplied files are reference material; their inline demo scripts, fake domains, sample counts, and pretend Undo behavior are not implementation instructions.

Import has two stages: configure the file/target/mode, then review actual validation and add/update/remove/unchanged counts before committing. Merge & Update is the default; it updates by account_id, adds new accounts, and preserves absent accounts. Wipe & Replace deliberately removes accounts missing from the new valid dataset. A different target rule requires Replace instead of silently rebinding existing accounts.

The target accepts an exact HTTPS URL or one trailing path wildcard on an explicit host, such as `https://qa.example.com/*` or `https://qa.example.com/login*`. Wildcard hosts, regular expressions, and multiple simultaneous rules are outside scope. A matching pattern alone does not trigger form detection: the active page must also match the exact configured login profile. Active Tab and preset chips fill the input for review; they do not save or authorize it automatically.

The account list supports the same non-password search as the popup, individual delete with a 30-second Undo opportunity, and Purge All with an explicit count-bearing confirmation. Undo restores the deleted account only while its session and catalog revision remain valid. Purge removes accounts and history but preserves vault setup and profile settings; full vault reset remains a distinct action. The footer reports actual encrypted-vault usage against the product's 5 MiB limit, not an invented browser quota.

## Success Criteria

- A user can configure the website later, import a valid CSV, unlock the vault, search by arbitrary metadata, and fill both login fields.
- Every import requires a valid HTTPS target rule. Autofill requires both that rule and the exact configured login profile to authorize the current page; a changed rule invalidates profile approval until reviewed.
- Merge preserves absent accounts; Replace previews removals; invalid rows never overwrite existing records. Delete/Undo and confirmed Purge All update counts, search, history, and storage consistently.
- Returning to the last successful account takes opening the popup and pressing Use this account, followed by the user's manual Login action.
- CSV diagnostics include row numbers and safe reason codes; a failed or cancelled import leaves the previous catalog intact.
- No stored account password or master password appears in plaintext in persistent extension storage, logs, errors, or extension UI.
- Invalid host, path, frame, permission, selector, lock state, or navigation causes autofill to fail closed.
- A failed login, account selection, or successful field fill alone never replaces the last successful account.
- Full-page navigation and same-document application navigation are covered by controlled browser acceptance scenarios.
- Search of a representative 10,000-account catalog targets a response within 200 ms after the final keystroke on the documented test machine; measured results accompany implementation validation.

## Decisions Carried into Planning

- The confirmed master-password design includes manual locking, a 15-minute inactivity lock, and locking on browser restart, extension reload, update, or disable. There is no password recovery; reset deletes the vault after explicit confirmation.
- **Refinement to the brief carried into planning:** exclude the password column from search. All other columns remain searchable. Searching passwords can reveal information about them through match results. This is an explicit exception to “every CSV column,” included in this planning baseline.
- MVP success detection uses either a configured destination URL or a visible configured element on a configured authorized route. Login-form disappearance alone is insufficient because errors and loading states can also remove forms.
- Proposed operating limits: 2 MiB UTF-8 CSV, 10,000 data rows, 100 columns, and 5 MiB serialized encrypted vault. Oversize data is rejected with the current vault preserved.
- Actual URLs/selectors and an application-specific success signal are unknown. Controlled fixtures can verify the extension; compatibility with the intended application remains unverified until its profile is configured and exercised.

## Pre-Mortem Risk Review

### The Plan

Deliver the locally encrypted, authorized-site account workflow above. Success means reliable import/search/fill, no unintended credential disclosure, and accurate history under failed authentication and browser lifecycle changes.

### Time Jump

It is three months after release. A selector update filled the wrong control, stale login attempts overwrote history, and an import discarded usable accounts. QA has stopped trusting the extension and returned to spreadsheets.

### What Went Wrong

| Category | Failure mode | How it played out | Prevention / response |
| --- | --- | --- | --- |
| Technical | Credentials sent to an unintended page | A permissive URL check accepted a lookalike host or tab navigation race | Exact parsed URL checks in worker and content script; document-targeted messages; fail closed |
| Technical | Secrets survive locking | A decrypted cache, delayed import, or background request repopulated storage after Lock | Trusted-only storage, session generations, serialized writes, invalidate pending work on lock |
| Assumptions | Success detection misattributes an account | A stale attempt observed an already visible dashboard marker | Correlated expiring attempts, false-to-true conditions, one current attempt per tab, documented signal limits |
| Execution | CSV replacement destroys the usable catalog | Duplicate identifiers or malformed quotes were accepted and partial writes committed | Explicit validation rules, preview, atomic encrypted replacement, zero-valid-row rejection |
| External | Website updates break autofill | A selector matched hidden or multiple fields after a release | Require two unique visible usable inputs; show actionable profile errors; maintained fixture checks |
| Technical | Worker suspension loses attribution | In-memory pending state disappeared during authentication | Store secret-free attempts and unlocked key in trusted session storage; revalidate after worker restart |
| People | Master password is lost | A user cannot unlock an irreplaceable import | Explain no recovery during setup; retain source CSV securely; confirmed destructive reset |
| Assumptions | Catalog is too large | Search lag and storage quota errors make the popup unusable | Enforce limits, build an in-memory search index, measure a representative maximum-size catalog |
| External | Application uses unsupported authentication | Cross-origin SSO, embedded forms, or closed shadow roots defeat selectors | State supported form scope, reject unsupported targets, validate the intended application before rollout |
| People | No one owns profile maintenance | Broken selectors stay deployed and users repeatedly choose wrong records | Assign the profile owner, surface failures, maintain a small acceptance checklist |
| Technical | Undo restores obsolete credentials | A delayed Undo resurrected an account after a new import or purge | Bind encrypted undo records to session, expiry, and post-delete revision; invalidate on intervening vault changes |
| Assumptions | A wildcard silently broadens credential access | A domain-wide rule was mistaken for permission to fill every form | Permit only explicit-host path patterns and still require an exact configured login page; preview rule changes |

### Risk Prioritization

Priority 1 is highest.

| Failure mode | Likelihood | Impact | Priority |
| --- | --- | --- | --- |
| Unintended credential target | Medium | High | 1 |
| Secrets survive locking | Medium | High | 1 |
| Incorrect success attribution | High | Medium | 2 |
| Destructive CSV replacement | Medium | High | 2 |
| Website selector changes | High | Medium | 2 |
| Worker state loss | Medium | Medium | 3 |
| Lost master password | Medium | High | 3 |
| Oversized catalog | Medium | Medium | 3 |
| Unsupported authentication | Medium | Medium | 3 |
| Unowned profile maintenance | Medium | Medium | 4 |
| Stale Undo after data changes | Medium | High | 2 |
| Overbroad URL pattern interpretation | Medium | High | 1 |

### Top 5 Risks & Mitigations

1. **Wrong credential target.** Early warning: lookalike origins, broad pattern interpretation, unexpected field matches, or navigation during fill. Prevention: explicit-host path patterns combined with exact profile-route validation, top-frame-only operation, and binding fill to the observed document. Mitigation: abort with a safe error, invalidate the attempt, and let the user repair the profile. Owner: extension implementer; profile owner verifies the authorized application.
2. **Secrets remain accessible after lock.** Early warning: search or fill succeeds after Lock, or secrets appear in a storage inspection. Prevention: encrypted persistence, trusted-only session state, generation checks on asynchronous work, and lock checks at every privileged request. Mitigation: clear all sensitive in-memory/session state and require unlock. Owner: extension implementer.
3. **False last-successful attribution.** Early warning: failed logins or unrelated navigation change the highlighted account. Prevention: a fresh acknowledged fill, exact tab/profile/account/revision association, expiry, and a configured success transition. Mitigation: discard ambiguous attempts and preserve the prior successful ID. Owner: extension implementer; profile owner selects a reliable signal.
4. **Account-management data loss or stale restoration.** Early warning: duplicate IDs, unexpected update/removal counts, stale Undo, or quota errors. Prevention: explicit import modes, safe change previews, atomic writes, confirmed purge, and expiring revision-bound Undo. Mitigation: preserve the previous vault on failed writes and reject stale restoration; securely retained source CSV supports recovery from an intentionally confirmed replacement/purge. Owner: extension implementer; user reviews destructive-action counts.
5. **Website changes break forms.** Early warning: missing, hidden, disabled, duplicate, or swapped fields. Prevention: validate both selectors and read back field values after native input events. Mitigation: stop filling, show the failed configuration condition without credentials, and update the profile. Owner: profile owner; extension implementer maintains browser regression scenarios.

### Pre-Mortem Insights

Encrypting the CSV is insufficient without a defined unlocked-session lifecycle. A configured success signal is evidence of a page state, not proof of server-side account identity. Replacement imports, worker restarts, and simultaneous tabs all need explicit consistency rules. Password searching conflicts with keeping secret values undiscoverable in the UI.

### Revised Confidence

Moderate for the documented MVP. Confidence increases after browser tests exercise the boundaries in the EARS document and the real application's profile passes manual acceptance. This specification and risk review form the planning baseline; the implementation plan is reviewed separately.

## Available-height constraint

Per the user’s layout correction, both popup and settings panels fit within 600px or the available viewport, whichever is smaller. Settings subtracts its outer spacing. Header and footer remain visible while the central content scrolls internally.
