# Chrome Web Store listing

Copy for the Login Pal store listing. The Description field is plain text, so the
bullets below are literal characters rather than Markdown syntax — paste the
fenced blocks as-is.

## Short description (132 character limit)

Option A (119 chars):

```
Switch between synthetic QA login accounts. Import a CSV, search it, autofill the login form. Local only, never submits.
```

Option B (125 chars):

```
A local catalog of synthetic QA/test accounts. Import a CSV, search, and autofill authorized login forms. No server, no sync.
```

## Detailed description

```
Login Pal is a local account catalog for QA, support, and demo work. Import a CSV of synthetic test accounts, bind it to a login page you are authorized to test, then search and autofill that page's username and password fields — without hunting through a spreadsheet or pasting credentials by hand.

Built for one job: switching between many test accounts on the same login page, quickly and repeatably.

WHY INSTALL IT

• Stop alt-tabbing to a spreadsheet. Search 10,000 accounts by ID, username, or any metadata column from the toolbar popup.
• Keep test data out of your personal password manager. Synthetic QA accounts live in their own catalog, separate from anything real.
• Know which account you last used. The popup shows recently filled accounts and the last account that actually reached a successful login.
• Everything stays on this computer. No account, no server, no sync, no telemetry.

HOW IT WORKS

1. Import a CSV. Required columns are account_id, username, and password; every extra column is kept and searchable. A 3-row sample CSV is built in.
2. Name a group and set its authorized login origin. Each named group has its own URL rule, login profile, accounts, and history — up to 50 groups.
3. Configure the login profile. Match the username and password inputs by CSS selector, input ID, input name, autocomplete token, placeholder, visible label, or aria-label. Ambiguous matches are refused rather than guessed.
4. Open the popup on that login page, search, pick an account, and choose Autofill. You press the site's Login button yourself.

WHAT IT DOES NOT DO

• It never submits a form. Filling fields and signing in stay separate actions.
• It never fills a page you have not explicitly authorized. Host access is optional and granted per origin.
• It does not search, display, or export passwords in account summaries.
• It makes no network requests of its own: no application server, no sync, no telemetry, no remote fonts, no CDN assets.

MANAGING DATA

Export any group back to CSV. Delete an account with a 30-second Undo. Purge a group's accounts while keeping its URL rule and profile, or reset a group entirely. The local snapshot is stored with AES-256-GCM in extension local storage so the catalog opens without a prompt — convenient for QA, and the reason it is not a password manager.

IMPORTANT

Use synthetic test accounts only. There is no master password, lock, or inactivity timeout, so anyone with access to your Chrome profile can read the catalog. Do not store real user or production credentials in it.

SCOPE

Autofill works on visible, writable username and password inputs in the ordinary top-level page DOM. Embedded iframes, closed shadow roots, SSO handoffs, and multi-step login flows are out of scope for this version. Requires Chrome 121 or newer. Disabled in Incognito.

Crafted by metuur.
```

## Privacy practices tab

Each field below has a 1,000 character limit. Paste the fenced block only.

### Single purpose description

```
Login Pal gives QA, support, and demo users a local catalog of synthetic test accounts and fills those accounts into a login form on a site the user has explicitly authorized. The user imports a CSV of test accounts, binds it to one login origin, configures which username and password inputs to match, then searches the catalog and chooses an account to fill. The extension writes the two field values and stops there — it never submits the form and never acts on a site the user has not authorized. Everything else in the product exists to serve that one job: importing and exporting the CSV, searching account metadata, and showing which account was filled most recently.
```

### storage justification

```
Stores the user's imported account catalog and its settings on the local device: account groups, each group's authorized URL rule, the login profile describing which inputs to match, and the recent/last-successful fill history shown in the popup. The catalog is held as an AES-256-GCM encrypted snapshot in chrome.storage.local, and both chrome.storage.local and chrome.storage.session are set to TRUSTED_CONTEXTS so no content script or page script can read it. Without this permission the user would have to re-import their CSV on every browser restart. Nothing in storage is transmitted anywhere; the extension makes no network requests.
```

### scripting justification

```
Used only against the single origin the user authorized for a group, for three tasks. First, field detection: the extension reads identifying attributes of the login inputs (id, name, autocomplete, placeholder, label, aria-label) so the user can configure matching without opening DevTools. It never reads or returns input values. Second, filling: it injects the content script that writes the selected account's username and password into the two configured inputs. Third, success detection: it checks whether the configured success element is visible at the configured route, so the popup can report that a login actually succeeded. Every call is preceded by a chrome.permissions.contains check and a URL match against the user's own rule.
```

### activeTab justification

```
Filling is an explicit user gesture started from the toolbar popup, and it must apply to the tab the user is actually looking at. activeTab scopes that work to the current tab at the moment the user clicks Autofill: the extension resolves the active tab, confirms its URL still matches the group's authorized rule, and only then writes the two field values. It also lets Settings offer the most recently used tabs already on the authorized domain as sources for field detection, so the user does not have to guess which page is being inspected. The extension does not read or act on tabs outside the origin the user authorized.
```

### clipboardWrite justification

```
Supports an explicit per-account "copy password" button in the extension's own pages. When the user clicks it, the password for that one account is fetched transiently from the background worker and written straight to the clipboard with navigator.clipboard.writeText. The value is never rendered into the DOM, never logged, and never included in search results or account summaries. QA users need this to paste a test password into a flow the extension does not fill, such as a re-authentication prompt or a second-step form outside the configured login page.
```

### Host permission justification

```
Host access is optional and is never granted at install time. The manifest lists https://*/* and http://*/* as optional_host_permissions only so the user can authorize whichever internal QA origin they work on — these hosts are usually private staging domains that cannot be enumerated in advance, and http is requestable because QA environments are often served without TLS. At runtime the extension requests exactly one origin, the one the user typed into the group's login profile, through chrome.permissions.request. Every privileged operation re-checks chrome.permissions.contains and re-matches the tab URL against the user's rule before running, so the effective access is one origin per group, not all sites.
```

### Data usage

Google's User Data FAQ (Q3) is explicit: disclosure is required **even when data
is only processed or stored locally and never transmitted**. "Handle" means
collecting, transmitting, using, *or* sharing. Local-only storage is a
mitigation, not an exemption. Declaring "no data collected" because nothing
leaves the device would be a false disclosure.

Check these three:

| Category | Check | Why |
| --- | --- | --- |
| Personally identifiable information | **Yes** | The CSV format ships with email-shaped usernames and a `customer_name` column (`examples/accounts.csv`), and metadata columns are arbitrary, so the extension cannot constrain what the user imports. |
| Health information | No | Never handled. |
| Financial and payment information | No | Never handled. |
| Authentication information | **Yes** | Core data type. The extension stores account passwords locally and fills them into a login form. |
| Personal communications | No | Never handled. |
| Location | No | No geolocation API, no IP collection, no network requests at all. |
| Web history | No | The manifest has no `tabs` permission, so tab URLs and titles are readable only on an origin the user explicitly authorized. The recent-tab picker reads those transiently and persists nothing but the user's own configured URL rule. No browsing history is built or stored. |
| User activity | No | No click, scroll, mouse, keystroke, or network monitoring. Fill history records which synthetic account was filled and whether the configured success condition was observed — not observation of the user. |
| Website content | **Yes** | Field detection reads login input attributes (id, name, autocomplete, placeholder, label, aria-label) from the page DOM, and success detection queries a configured element. Values are never read, stored, or transmitted, but the FAQ counts reading page content as handling. |

Tick all three certifications — each is true:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

### Privacy policy URL — required

FAQ Q14: any product that handles user data needs a posted privacy policy, even
when it only stores locally. This extension handles authentication information,
so the URL field is mandatory. The policy can be short, must be publicly
reachable, and must stay consistent with the table above: what is handled, that
it stays on the device, that nothing is transmitted or sold, and how the user
deletes it (Purge group, Reset group, or uninstall).

### Remote code

**No, I am not using remote code.** Verified against all three criteria in the
built package:

| Criterion | Result |
| --- | --- |
| External `<script>` tags | None. `dist/popup.html` and `dist/options.html` load relative `popup.js` / `options.js`; other refs are local icons and `ui.css`. |
| Modules pointing to external files | None. No `import(`, `importScripts`, or dynamically created `<script>` in `background.js`, `content.js`, `options.js`, `popup.js`. |
| `eval()` / `new Function` | Zero occurrences in all four bundles. |

`dist/ui.css` has no `@import` and no remote `url()`; the five woff2 faces ship
in `dist/fonts/`. The CSP is
`script-src 'self'; object-src 'none'; connect-src 'none'; base-uri 'none'`.

Not remote code, if a reviewer asks: the functions passed to
`chrome.scripting.executeScript` and the injected `content.js` are serialized
from code inside the package, and the user's configured CSS selector is matched
against the DOM, not evaluated as JavaScript.

## Notes before submitting

- The IMPORTANT section is deliberate. Credential-adjacent extensions get extra
  scrutiny, and stating plainly that this is synthetic-data-only with no master
  password is the fastest way past a reviewer wondering whether this is an
  unsafe password manager. Keep it even though it reads as a drawback.
- `README.md` line 9 says "This is an unpacked developer installation, not a
  Chrome Web Store release." Update that line if the listing links this repo.
- The host permission justification is the field most likely to draw a
  rejection, since `https://*/*` plus `http://*/*` looks far wider than the
  exact-origin checks the extension actually enforces. If it is rejected
  anyway, the fallback is to drop `http://*/*` and support HTTPS QA origins
  only.
