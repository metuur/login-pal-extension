# OneChat DEV Login Assistant

A Chrome extension for synthetic QA/support accounts. Import a local CSV, bind it to an authorized HTTPS site, search account metadata, and intentionally fill a configured login form. The extension never submits the form. Accounts and history stay on this computer, without a master password or lock flow.

## Install

Requires Chrome 120 or newer. Extract `onechat-dev-login-assistant.zip`, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the extracted `dist` folder. Keep that folder in place. Pin the extension using Chrome's Extensions menu.

The repository's `dist` folder is also directly loadable after building. This is an unpacked developer installation, not a Chrome Web Store release.

## First use

1. Open the extension. A local catalog is created automatically, ready for CSV import.
2. Open Settings, name the selected CSV group (or choose **Create new group**), and choose a CSV. Use **Download sample CSV (3 rows)** for the supported format. Enter the required **Target authorized URL pattern**, for example `https://qa.example.com/*`. This example is illustrative; use your own authorized site.
3. Keep **Merge & Update** to add/update accounts by ID while preserving omitted accounts in that group. **Upload another CSV** automatically selects Merge for the same group. Choose **Wipe & Replace** to replace only the selected group’s dataset. Verify the file, review counts and errors, then confirm the import. Invalid rows are excluded; Replace can therefore remove existing accounts corresponding to invalid rows.
4. Configure the login profile: a name, exact HTTPS login URL, username/password matching rules, and a reliable success URL or visible element at its configured URL. Save and authorize the requested host permission. Importing alone does not authorize autofill.
5. Visit the exact login page, open the popup, search by account ID, username, or metadata, select an account, review it, and choose Autofill. Submit the site's Login button yourself.

“Recent” means the fields were filled successfully. “Last successful” updates only after the configured success condition is observed within two minutes. A failed login leaves the previous successful account unchanged. Editing filled values cancels attribution.

The actual target website is deliberately left unconfigured. **Real-site compatibility is unverified** until its selectors and success signal are configured and exercised.

## CSV format

See [the synthetic example](examples/accounts.csv). Required headers are `account_id`, `username`, and `password`. Additional columns are retained as text and searchable. Passwords are never searched or displayed in account summaries. IDs are case-sensitive; all occurrences of a duplicate ID are rejected. IDs and usernames are trimmed, while password whitespace is preserved.

UTF-8 (including BOM), quoted commas/newlines, doubled quotes, and CRLF/LF are supported. Limits: 2 MiB per file, 10,000 data rows, 100 columns, 10,000 stored accounts, and a 5 MiB serialized encrypted vault. Import errors show safe row numbers/codes without credential contents. The source CSV remains on your disk; the extension does not encrypt or delete that original file.

## URL matching and supported forms

Each named CSV group has its own catalog URL rule, login profile, accounts, history, and Undo. Select the group in the popup or Settings. Existing accounts are kept in “Imported accounts”. Account IDs must be unique within a CSV/group, but may repeat across groups. Up to 50 groups are supported; each retains the documented per-catalog limits, and Chrome’s overall storage quota still applies. Rules require an explicit HTTPS host, with an optional single terminal pathname `*`; wildcard hosts are rejected. Origin (including port), pathname, and hash matter; query parameters are ignored. An encoded star is literal. The login route itself must be exact even when the catalog uses a broader rule. Success must be on the same origin.

Autofill supports top-level, visible, writable username/text/email and password inputs in the ordinary page DOM. It rejects ambiguous selectors and explicitly cross-origin form actions. Embedded frames, closed shadow roots, SSO handoffs, and multi-step logins are outside this version's scope. Changing the catalog target requires Replace and renewed profile approval.

## Manage synthetic accounts

- Delete removes one account and its history. Undo lasts 30 seconds, restores the account without old history, and expires on another relevant write or reset.
- Purge group asks for confirmation of that group’s entire account count and preserves its URL rule and profile. Other groups are untouched. Purge cannot be undone.
- Reset group is separate: it removes that group’s accounts, profile, session, and registrations. Shared host permission is retained if another group still uses it.
- There is no manual lock, inactivity timeout, or password prompt after restart. Use synthetic data only.

The local snapshot still uses AES-256-GCM, but its key is stored alongside it in trusted extension local storage so it can open automatically. This is **not password-protected storage**. Page scripts still cannot enumerate the catalog; explicit autofill is limited to your authorized login profile.

Older password-protected catalogs are preserved. If an old session is still available, migration is automatic. Otherwise enter the previous master password once using **Migrate accounts**; subsequent visits open directly. If you no longer know that password, use Reset and reimport the original CSV. Failed migration leaves the prior catalog unchanged.

No application server, synchronization, telemetry, remote fonts, or runtime CDN assets are used. Host access is optional and requested for the configured HTTPS host. Chrome host permissions are broader than the exact route/port checks enforced by the extension.

## Build and verify

For development, run `npm run dev`. It builds `dist` immediately and watches `src`, `public`, build scripts, and package/TypeScript configuration for changes. This includes regenerating the manifest version and copying changed static assets. Failed builds retry on the next save. Press Ctrl+C to stop. Load `dist` as an unpacked extension, then click Reload in `chrome://extensions` after a rebuild. This command builds the extension; it does not run a localhost web app or automatically reload Chrome.

Use Node.js 22 or newer and npm. The lockfile pins dependencies; the validated environment is recorded in [verification](docs/verification/account-login-assistant.md).

```sh
npm ci
npm run check
npm run lint
npx playwright install chromium
npm run test:browser
```

`check` runs TypeScript, focused tests, and the build. The browser harness requires `openssl` and creates an isolated Chromium profile and local HTTPS fixture, then removes them. It never uses your browser profile or real accounts. Its disposable extension copy grants localhost access to bypass a headless permission dialog; the shipping manifest retains optional-only host access.

Build output is `dist/`. Browser evidence and synthetic UI screenshots are written to `artifacts/`. Local font licenses are bundled in `dist/fonts/`. See [the completed task plan](docs/tasks/account-login-assistant.md) for requirement and commit traceability.

The build generates `dist/manifest.json`; `package.json` is the single source of its version. Use a Chrome-compatible numeric release version (no prerelease suffix). The popup and settings footer display the generated manifest version with “crafter by metuur”.

## Match username and password inputs

Each field has its own match method in Settings → Login profile. Existing profiles default to CSS. Choose CSS selector, exact input ID, exact input name, autocomplete token (such as `username` / `current-password`), placeholder, visible associated label, or `aria-label`. Label matching includes visible `aria-labelledby` text. Text comparisons ignore case and repeated whitespace; ID and name comparisons remain exact. Non-CSS methods consider visible, writable inputs of the correct type only. Ambiguous results abort filling. CSS may use comma-separated alternatives, but the combined selector must identify exactly one input. No form submission occurs.

## Export a CSV group

In Settings, select a group and click **Export CSV** beside its account list. The download includes every account in that group, regardless of the current filter, using `account_id`, `username`, `password`, followed by all metadata columns. The filename comes from the group name. UTF-8, quoting, commas, line breaks, and password whitespace are preserved; fields absent from a row are blank. The file includes synthetic passwords. Exported groups accumulated from multiple files may exceed the 2 MiB/100-column per-import limits; export never silently drops data to meet those limits.
