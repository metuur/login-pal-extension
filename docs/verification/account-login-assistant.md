# Account Login Assistant verification

## Current synthetic-data revision (2026-10-05)

Lock removal passed TypeScript, 57 focused tests, formatting, build, and 49 real-browser checks. New installations open automatically; restart retains access. Legacy migration tests verify wrong-password preservation and one-time conversion without account loss. The key is now persisted beside the encrypted snapshot, so local storage is not user-password protected. The historical password-lock results below describe the earlier release and are superseded for this revision. Current browser evidence is in browser-report.json.


Verified on 2026-10-04 in the authorized local build workflow. Domain, worker, and UI agents implemented and reviewed their assigned boundaries; the parent integrated content delivery, browser fixtures, packaging, and acceptance evidence.

## Results

- `npm run check`: passed TypeScript, all **58 tests in 6 files**, and the production build.
- `npm run lint`: passed formatting checks.
- `npm run test:browser`: **48 checks passed** in isolated Chromium **153.0.8010.12** on macOS arm64, Apple M3 Max, Node **25.6.0**, npm **11.8.0**.
- A real popup with **10,000 accounts** rendered the searched result **33.1 ms** after the input event (200 ms target). This is one local benchmark, not a guarantee for every device.
- Popup and settings screenshots were visually compared with the supplied light-theme references. Popup horizontal overflow checks passed at 360, 380, and 420 px. Packaged fonts/styles and reduced-motion CSS are included.

The exact browser checks and measurement are preserved in [browser-report.json](browser-report.json). The reproducible harness writes synthetic screenshots to `artifacts/popup.png` and `artifacts/settings.png`.

## Coverage

| Boundary | Evidence |
| --- | --- |
| CSV, rules, search, encryption | 28 domain tests: encoding/quoting/header errors, duplicate rows, password preservation/exclusion, merge/replace history reconciliation, route/origin policy, wrong-key/tampering failures, exact and one-over file/row/column/catalog/envelope limits |
| Worker and session authority | 15 tests: packaged-page sender checks, content denial, ciphertext-only persistence, storage failure preservation, encrypted Undo across worker suspension/expiry, stale previews, idle lock and TOUCH, lock/write races, permission revocation during inspection, cancellation during acknowledgement, independent concurrent successes |
| Content delivery and tracking | 8 tests: unique visible writable fields, disabled fieldsets, cross-origin forms, native value changes without submit, rollback preserving user edits, immediate cancellation, revalidation before observation |
| Shared UI | 7 tests: inert hostile metadata, real badges, accessible delete action, slash shortcut boundaries, password confirmation, failed acknowledgements, trusted activity throttling |
| Real browser integration | Setup, reviewed import through settings, search, masked fill without submission, exact-route denial, full and SPA navigation, worker termination during an attempt, element success, failed/preexisting success signals, delete/Undo, merge, lock/wrong unlock, encrypted persistent storage, purge cancellation/confirmation, 10k search, local-only requests, browser restart, full reset |

## Limits of verification

The native optional-host grant/deny dialog is not driven by the headless harness. It grants only localhost in a disposable extension copy for form tests, then restores the shipping optional-only manifest before the restart/reset checks. Sender/permission enforcement and revocation races are covered in worker tests. The installed extension's native permission prompt should be exercised when configuring the actual site.

The actual target website is not configured, so real-site compatibility is **unverified**. Chrome 120 is the declared minimum; this run used Chromium 153 and does not establish a tested browser-version matrix. Browser restart was exercised; extension update/disable behavior relies on Chrome session-storage lifecycle and was not separately automated. Accessibility checks are focused DOM, keyboard, styling, and viewport checks, not a screen-reader certification.

Fixtures contain synthetic accounts only. Reports contain checks and timings, never credentials. Source CSV files remain outside the encrypted vault. This is a tested local implementation, not an independent security audit.
