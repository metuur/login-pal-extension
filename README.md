# OneChat DEV Login Assistant

A Chrome extension for internal QA/support accounts. Import a local CSV, bind it to an authorized HTTPS site, search account metadata, and intentionally fill a configured login form. The extension never submits the form. Accounts and history stay encrypted on this computer.

## Install

Requires Chrome 120 or newer. Extract `onechat-dev-login-assistant.zip`, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the extracted `dist` folder. Keep that folder in place. Pin the extension using Chrome's Extensions menu.

The repository's `dist` folder is also directly loadable after building. This is an unpacked developer installation, not a Chrome Web Store release.

## First use

1. Open the extension and create a master password of at least 12 characters. Confirm it exactly; whitespace matters. There is no password recovery. Reset deletes the vault if you forget it.
2. Open Settings and choose a CSV. Enter the required **Target authorized URL pattern**, for example `https://qa.example.com/*`. This example is illustrative; use your own authorized site.
3. Keep **Merge & Update** to add/update accounts by ID while preserving omitted accounts. Choose **Wipe & Replace** to replace the entire dataset. Verify the file, review counts and errors, then confirm the import. Invalid rows are excluded; Replace can therefore remove existing accounts corresponding to invalid rows.
4. Configure the login profile: a name, exact HTTPS login URL, username/password CSS selectors, and a reliable success URL or visible element at its configured URL. Save and authorize the requested host permission. Importing alone does not authorize autofill.
5. Visit the exact login page, open the popup, search by account ID, username, or metadata, select an account, review it, and choose Autofill. Submit the site's Login button yourself.

“Recent” means the fields were filled successfully. “Last successful” updates only after the configured success condition is observed within two minutes. A failed login leaves the previous successful account unchanged. Editing filled values cancels attribution.

The actual target website is deliberately left unconfigured. **Real-site compatibility is unverified** until its selectors and success signal are configured and exercised.

## CSV format

See [the synthetic example](examples/accounts.csv). Required headers are `account_id`, `username`, and `password`. Additional columns are retained as text and searchable. Passwords are never searched or displayed in account summaries. IDs are case-sensitive; all occurrences of a duplicate ID are rejected. IDs and usernames are trimmed, while password whitespace is preserved.

UTF-8 (including BOM), quoted commas/newlines, doubled quotes, and CRLF/LF are supported. Limits: 2 MiB per file, 10,000 data rows, 100 columns, 10,000 stored accounts, and a 5 MiB serialized encrypted vault. Import errors show safe row numbers/codes without credential contents. The source CSV remains on your disk; the extension does not encrypt or delete that original file.

## URL matching and supported forms

One catalog URL rule and one login profile are supported. Rules require an explicit HTTPS host, with an optional single terminal pathname `*`; wildcard hosts are rejected. Origin (including port), pathname, and hash matter; query parameters are ignored. An encoded star is literal. The login route itself must be exact even when the catalog uses a broader rule. Success must be on the same origin.

Autofill supports top-level, visible, writable username/text/email and password inputs in the ordinary page DOM. It rejects ambiguous selectors and explicitly cross-origin form actions. Embedded frames, closed shadow roots, SSO handoffs, and multi-step logins are outside this version's scope. Changing the catalog target requires Replace and renewed profile approval.

## Manage accounts and locking

- Delete removes one account and its history. Undo lasts 30 seconds, restores the account without old history, and expires on another relevant write or lock.
- Purge All asks for confirmation of the entire catalog count and preserves the vault setup, URL rule, and profile. Purge cannot be undone.
- Reset is separate: it removes the vault, profile, session, and profile registrations/permission.
- Lock clears the unlocked session. The vault also locks after 15 minutes without explicit interaction and after a browser restart or extension reload. Background refresh does not renew inactivity.

Persistent account/history data uses AES-256-GCM with a fresh IV and a PBKDF2-HMAC-SHA-256 key derived with 600,000 iterations. While unlocked, key material is kept in Chrome's trusted extension session storage so service-worker suspension does not interrupt a session. Page scripts cannot request catalog data. The chosen website necessarily receives filled credentials and may handle them according to its own behavior.

No application server, synchronization, telemetry, remote fonts, or runtime CDN assets are used. Host access is optional and requested for the configured HTTPS host. Chrome host permissions are broader than the exact route/port checks enforced by the extension.

## Build and verify

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
