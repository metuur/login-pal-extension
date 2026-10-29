# JSON Account Import and Dual-Format Export — Low-Level Design

## Architecture

### The seam

`parseCsv` returns `CsvResult` (`src/shared/types.ts:93-99`) and `planImport`
(`src/domain/import.ts:32-101`) consumes only `parsed.accounts` plus the four
counters — verified: nothing at `:38`, `:49`, `:58` or `:69` inspects a row, a
header or a byte. The parse stage is therefore replaceable without touching the
merge engine. This design adds a second parser behind that return type.

```
File bytes ──► parseCsv  ──┐
                           ├──► ImportResult ──► planImport ──► VaultPayload ──► write()
File bytes ──► parseJson ──┘

Account[] ──► exportCsv  ──► text/csv string
Account[] ──► exportJson ──► application/json string
```

### Type changes (`src/shared/types.ts`)

- `CsvResult` → `ImportResult`. Four production call sites
  (`src/domain/csv.ts:2,54`, `src/domain/import.ts:3,34`), all compiler-caught.
  Note this leaves the codebase half-renamed: `CsvGroup` (`:128`) stays
  CSV-named because the group concept really is a CSV-era name. The rename is
  worth doing because it is free, not because it completes a naming pass. Carry
  a `// @debt` marker at `:128` recording that a deliberate pass is owed.
- `RowDiagnostic` → `ImportDiagnostic { at: number; unit: 'row' | 'record'; code: ImportDiagnosticCode }`.
  The current `row` field is overloaded across two disjoint meanings:
  `src/domain/csv.ts:86` computes `row: index + 2` *before* the blank-record
  filter at `:87`, so for CSV it is a physical file line with the header at 1 and
  `row === 1` unreachable; for JSON it is a 1-based array index where `1` is the
  first record. Carrying the unit in the type lets the UI render
  `${d.unit} ${d.at}: ${d.code}` with no format branch.
- `ImportDiagnosticCode` becomes a union instead of bare `string`
  (`src/shared/types.ts:91`). The codes are rendered verbatim to users at
  `src/options/index.ts:1002`, so they are already a UI contract; this change
  adds four, and no test currently asserts any code value.
- New `AccountFormat = 'csv' | 'json'`.
- `ImportPreview` gains `format: AccountFormat` so the review step can name the
  validated format (`R-JS-4.7`).
- `EXPORT_CSV` is extracted from the grouped member at `:169`
  (`{ type: 'RESET' | 'UNDO' | 'PURGE' | 'EXPORT_CSV' }`) into its own member
  `{ type: 'EXPORT_ACCOUNTS'; format: AccountFormat }`.
- `PREVIEW_IMPORT` gains `format: AccountFormat`.

### Page-pin hardening (prerequisite, `src/background/service.ts`)

The pin at `:314-319` compares `message.type` where the guard at `:295-301`
narrows it only to `string`; the cast to `Command` does not happen until `:344`.
Verified: `message.type === 'EXPORT_CSV'` remains type-valid after the union
member is renamed, while the dispatch at `:449` fails to compile. The result is
a green `npm run typecheck` with a dead security pin and `popup.html` able to
request a plaintext-password export. `src/background/groups.ts:209-216` casts to
`{ type: string }` and shares the property.

Replace both pin blocks (`:314-319` and `:320-325`) with one declaration:

```ts
const PAGE_PINS: Partial<Record<Command['type'], { page: string; error: string }>> = {
  EXPORT_ACCOUNTS: { page: 'options.html', error: 'Export accounts from Settings.' },
  FILL: { page: 'popup.html', error: FILL_WRONG_PAGE },
};
```

A stale key is `TS2353`. This lands **before** any rename (see Sequencing), so
the rename is provably safe rather than reviewer-dependent. It satisfies
`R-JS-7.1`.

### New module (`src/domain/json.ts`)

Two pure functions, no chrome APIs and no DOM, per `src/domain/AGENTS.md`.

`parseJson(bytes: Uint8Array): ImportResult`

1. Reject over 2 MiB on `byteLength`.
2. Decode with `new TextDecoder('utf-8', { fatal: true })`, then strip a leading
   U+FEFF, which `JSON.parse` rejects.
3. `JSON.parse` in a `try`; any throw becomes one whole-document rejection.
4. Require a top-level array.
5. Reject over 10,000 elements.
6. Reject the document if any element is an object with more than 100 own keys,
   matching CSV's whole-file rejection at `src/domain/csv.ts:88-89`.
7. Build the duplicate frequency map from trimmed `account_id` values, counting
   **only non-empty strings** — mirroring the `if (id)` guard at
   `src/domain/csv.ts:93`. Without it, records with an empty identifier report
   `DUPLICATE_ACCOUNT_ID` where CSV reports `EMPTY_ACCOUNT_ID`.
8. Per record, evaluate in CSV's order (`src/domain/csv.ts:101-112` puts
   duplicates first): `DUPLICATE_ACCOUNT_ID`, `RECORD_NOT_OBJECT`,
   `REQUIRED_FIELD_NOT_STRING`, `EMPTY_ACCOUNT_ID`, `EMPTY_USERNAME`,
   `EMPTY_PASSWORD`, `METADATA_VALUE_NOT_SCALAR`. Emit the first match and skip
   the record.
9. Trim `account_id` and `username`; take `password` exactly as decoded.
10. Build metadata with `Object.fromEntries`, as `src/domain/csv.ts:117-121`
    does. A plain `{}` literal with `metadata['__proto__'] = v` would invoke the
    prototype setter; `JSON.parse` itself makes `__proto__` an own property on
    the parsed record, so the hazard is in the object being constructed, not the
    one being read.
11. Return `{ accounts, found, valid, invalid, diagnostics }`, `found` being the
    element count of the top-level array.

`exportJson(accounts: Account[]): string`

- Top-level array, one object per account, in stored order.
- `account_id`, `username`, `password` first, then that account's own metadata
  keys sorted alphabetically.
- Absent metadata keys omitted, not padded. This is the one deliberate
  difference from `exportCsv`, which pads with `''` (`src/domain/csv.ts:18`).
- `JSON.stringify(value, null, 2)` plus a trailing `'\n'`. No BOM.

### Format descriptor (`src/shared/formats.ts`)

Six facts must agree across two files: the `accept` string
(`src/options/index.ts:115`), extension-to-format derivation (`:898-904`), Blob
MIME (`:1113`), filename suffix (`:1116`), button label (`:1105`) and the
diagnostic unit word (`:1002`). A record keyed by `AccountFormat` holding
`{ extension, mime, label, unit }` centralizes them. Parse and export functions
stay out of it, so `src/shared/AGENTS.md`'s contracts-only rule holds and the
domain layer stays pure.

No format-dispatch module in the domain layer. `parseCsv` signals
document-level failure by **throwing** format-specific messages
(`src/domain/csv.ts:55,60,69,79-81,89`), not by returning diagnostics, so a
dispatcher would either flatten those — breaking `R-JS-1.6` — or re-expose both
sets. MIME and extension live in the UI, which would branch anyway. And
`src/background/service.ts:412-610` is already a flat if-chain over
`command.type`; a two-way branch inside the `PREVIEW_IMPORT` block at `:484-512`
matches the file's shape.

### Background worker

- `PREVIEW_IMPORT` (`:484-512`) validates `command.format` against the literal
  pair alongside the existing byte and mode checks, then dispatches to
  `parseCsv` or `parseJson`. Everything after the parse call is unchanged.
- `COMMIT_IMPORT` (`:513-522`) is unchanged; the format is already baked into
  the payload held against the token.
- `EXPORT_ACCOUNTS` replaces the `EXPORT_CSV` branch at `:449`, validates
  `command.format` (`R-JS-4.3`), and returns `exportCsv(...)` or
  `exportJson(...)`.
- One export command rather than an additive `EXPORT_JSON`: the pin (`:314-319`),
  the `this.assert()` unlock gate (`:448`), the safe-message entry and the
  `src/options/AGENTS.md` password carve-out all attach to *the command that
  returns plaintext passwords*. One command is one security surface to audit.
  (An earlier draft justified this as avoiding pin drift; the typed `PAGE_PINS`
  table removes that risk, so it is not the reason.)

### Safe messages

Every string below is added to `SAFE_ERRORS` (`src/background/service.ts:113-152`).
There is no fallback option: `R-JS-1.6` requires the cause be named, and the
current bare `throw new Error()` for invalid `PREVIEW_IMPORT` shapes (`:485-492`)
lands on the generic text at `:353`.

- `'JSON exceeds the 2 MiB file limit.'`
- `'JSON must use valid UTF-8.'`
- `'File is not valid JSON.'`
- `'JSON must be an array of account records.'`
- `'JSON exceeds 10,000 records.'`
- `'JSON records are limited to 100 fields.'`
- `'Choose a supported file format.'`

Also resolve the pre-existing gap this feature depends on: `:271` throws
`'Vault size limit.'`, which is **not** in `SAFE_ERRORS`, while the allowlisted
string is `'Vault exceeds the 5 MiB encrypted storage limit.'` (`:141`) thrown
from `src/domain/crypto.ts:194`. `R-JS-1.5` relies on that path producing a safe
message.

### Settings UI (`src/options/index.ts`)

- `accept` (`:115`) becomes `.csv,.json,text/csv,application/json`.
- Format derived from the file extension in the change listener (`:898-904`) and
  sent on `PREVIEW_IMPORT` (`:933-939`). An unrecognized extension is refused
  before any request (`R-JS-4.6`).
- The review panel (`:956-1017`) names the validated format beside the file
  name. Diagnostics render `${d.unit} ${d.at}: ${d.code}` from the descriptor,
  with no format branch.
- Export becomes two buttons, each sending `EXPORT_ACCOUNTS` with its format,
  reusing the existing download mechanics at `:1104-1136`.
- Format is **not** a preview-invalidation trigger. It is derived from the file
  selection, so the existing four triggers (file, rule, mode, snapshot revision)
  already cover every way it can change. A fifth condition could never fire
  independently.
- Microcopy: the strings that become wrong once `.json` is accepted are the
  `'Import CSV'` tab label (`:292`), `'Choose an account CSV'` (`:118` and its
  reuses at `:101`, `:134`, `:901`, `:1027`, `:1386`, `:1399`),
  `'Choose a CSV file first.'` (`:909`), `${p.valid} valid rows` (`:962`),
  `${p.invalid} invalid rows will be excluded` (`:990-995`), and
  `Row diagnostics (n)` (`:1000`). `'CSV group name'` (`:80`) and
  `'Download sample CSV (3 rows)'` (`:138`) stay as they are — the first is
  pre-existing naming debt that should not be laundered through this feature,
  the second remains literally true.

### Documentation ownership

- `src/domain/AGENTS.md` reads "Pure **CSV**/import/search/rule/crypto
  functions" and must be widened.
- `src/options/AGENTS.md` is the load-bearing one. Its carve-out is written
  entirely in CSV terms — "Settings may receive **CSV** including synthetic
  passwords solely to create the requested local download" and "Never show raw
  **CSV** rows or secrets." As written it does not authorize Settings to receive
  JSON containing passwords. It must be widened explicitly, not inherited.
- `docs/ears/account-login-assistant.md:45` titles Unit 2 "**CSV** validation
  and import modes" while `src/domain/import.ts:31` annotates `planImport` with
  `@spec R-2.8..R-2.20`. After this change `planImport` serves both formats, so
  the heading becomes "Import validation and modes" in the amendment.
  `src/domain/json.ts` carries `@spec R-JS-1.1..R-JS-3.8`.

### Preview harness

`preview/bridge.ts:126` dispatches into the real `service.handle`. Verified: the
harness sender is `{ id, url: getURL(page) }` with no `tab` or `frameId`, and
both the `trusted` check (`src/background/service.ts:302-306`) and the pin pass
for `options.html`, so the dev SPA inherits both commands with no adapter
change.

## Constraints

- **Flat string metadata.** `validPayload` (`src/domain/crypto.ts:102-120`) runs
  inside `encryptVault` on every write and requires every metadata value to be a
  string (`:117`). No import path can bypass it.
- **Account invariants.** The same gate requires a trimmed, non-empty, unique
  `accountId`, a trimmed non-empty `username` and a non-empty `password`. A
  whitespace-only password is allowed; empty is not.
- **Shared ceilings.** 2 MiB per file, 10,000 records, 10,000 accounts in the
  result (`src/domain/import.ts:70`), 5 MiB serialized envelope
  (`src/domain/crypto.ts:194`).
- **Domain purity.** No chrome APIs or DOM in `src/domain/`.
- **Serialized command queue.** Every command runs through `this.tail`
  (`src/background/service.ts:340-345,357`), so a synchronous parse blocks all
  other commands for its duration.
- **Transport shape.** The file crosses as `number[]`
  (`src/options/index.ts:937`), capped on array length in the worker before
  reconstruction (`src/background/service.ts:487`).
- **Safe-message allowlist.** Only `SAFE_ERRORS` members reach the user
  verbatim.
- **Shared contracts.** `src/shared/AGENTS.md` reserves `src/shared/types.ts`
  for the root agent during parallel work; this change touches it three ways.
- **No stale-client window.** An MV3 update orphans the previous page's message
  channel, so a Settings tab from the prior version cannot send `EXPORT_CSV` to
  the new worker. No alias or dual-accept period is needed.

## Key Decisions

**A top-level array, not a wrapper object.** The document is
`[{ "account_id": …, "username": …, "password": …, …metadata }]`. A wrapper such
as `{ "version": 1, "accounts": [...] }` was rejected: nothing needs a version
field, the vault carries its own `schemaVersion`, and a wrapper would make
import liberal in two shapes for no gain. The flat array mirrors CSV, which is
rows without an envelope.

**Reserved key names match the CSV headers.** `account_id`, `username`,
`password` rather than `accountId` and friends — one mental model across both
formats, and an exported JSON can be diffed against an exported CSV.

**Format is declared, not sniffed.** The UI knows the filename. Content sniffing
was rejected because the worker should not guess at the type of a file it was
handed, and a mislabelled file is worth reporting rather than silently
recovering from.

**Scalars coerced, non-scalars reject the record.** A number or boolean becomes
`String(value)`, matching the existing rule that metadata is retained and
rendered as text. `null` becomes `''`, matching an empty CSV cell. An array or
object makes the record invalid, because flattening would invent a
representation the user never wrote. Rejecting numbers outright was dropped:
`{"port": 8080}` is ordinary in QA fixtures and CSV accepts the same value as
text.

**Numeric spelling is not preserved, and this is a known limitation.**
`JSON.parse('{"id": 12345678901234567890}')` yields `12345678901234567000`;
`String(1e21)` yields `"1e+21"`; `String(-0)` yields `"0"`. The same values
arrive from CSV as exact text. So `R-JS-6.2` carves numeric metadata out of the
CSV/JSON equivalence claim, and `R-JS-3.4` tells users to quote values whose
spelling matters. Note the round-trip requirement `R-JS-6.1` still passes
regardless, because export writes the already-coerced string — the loss happens
once, at first import, and is invisible thereafter.

**The 100-key ceiling rejects the document, not the record.** An earlier draft
made it a per-record `KEY_COUNT_EXCEEDED` diagnostic. That invented a divergence:
`src/domain/csv.ts:88-89` makes a column count over 100 a whole-file throw, so a
record that is both a duplicate and over-wide would be treated differently by
each format while `R-JS-6.2` claims they match.

**JSON export omits absent metadata keys.** `exportCsv` must pad because a CSV
row has a fixed column count. JSON has no such constraint, so omitting the key
preserves the record as stored and makes a JSON round trip lossless. An
intentional asymmetry.

**One export command with a format parameter**, for the audit-surface reason
given above — not for drift avoidance, which the typed pin table already solves.

**Two export buttons, no format picker.** Export is a single gesture; a dropdown
plus a button adds UI state and a second click for nothing. Import keeps one
file input because the file carries its own format.

**Diagnostic position carries its unit in the type** rather than being resolved
by a format branch in the UI, because the two meanings of the old `row` field
are disjoint and the unit was never represented.

**Duplicate JSON keys within one record are last-wins.** `JSON.parse` keeps the
last occurrence and exposes no hook to detect it; detecting them needs a custom
parser, out of proportion for synthetic fixtures. Duplicate *account IDs across
records* are still detected and rejected.

## Security

- **Page pinning must be typed before the command is renamed.** See the
  hardening section; this is the one change in this design that can disclose
  passwords if done in the wrong order. `R-JS-7.1`–`R-JS-7.4`.
- **Refusal must be asserted by message, not by failure.**
  `src/background/service.test.ts:453-460` asserts only `.ok === false`, which a
  broken pin also satisfies because the stale type falls through to the bare
  `throw` at `src/background/service.ts:609`. The test must assert
  `'Export accounts from Settings.'`
- **`exportJson` serializes plaintext passwords.** Same exposure class as
  `exportCsv`: the string crosses to Settings, becomes a Blob, and must never be
  rendered or logged, with its object URL revoked after the download starts.
  `src/options/AGENTS.md` must be widened to cover it.
- **Metadata construction cannot touch a prototype.** `Object.fromEntries` or a
  null-prototype object; `validPayload`'s `record()` check
  (`src/domain/crypto.ts:106,116`) is the backstop.
- **No new network surface.** `parseJson` and `exportJson` are pure; the
  extension-pages CSP keeps `connect-src 'none'`.

## Rollback

Reverting is clean. Nothing persisted changes shape: `VaultPayload` stores
`Account` records that are byte-identical regardless of which format produced
them, so accounts imported from JSON are indistinguishable from CSV-imported
accounts after a revert and no data is stranded or orphaned. The encrypted
envelope, the key, the catalog rules, the profiles and the history are untouched
by this change.

Two user-visible consequences of a revert, both acceptable:

1. Previously exported `.json` files stop being importable. The user re-exports
   as CSV from the reverted build, since the accounts themselves survive.
2. A Settings tab open across the revert shows a JSON export button that fails.
   An MV3 update orphans the old page's channel, so the failure is the generic
   refusal, not a silent success.

No migration, no feature flag, no dual-accept window.

## Test plan

`src/domain/AGENTS.md` requires testing critical branches before implementation.
`src/domain/boundaries.test.ts:11-25,27-46,48-56` is the model — it covers each
CSV ceiling at the exact accepted value and the first rejected one.

**Boundaries (`src/domain/boundaries.test.ts`)** — mirror all three for JSON:
exactly 10,000 records accepted and 10,001 rejected; exactly 100 own keys
accepted and 101 rejected; exactly 2 MiB accepted and one byte more rejected.

**Parser (`src/domain/domain.test.ts`)** — per diagnostic code, in ladder order;
the empty-identifier case that proves the `if (id)` guard (`R-JS-2.3`); a
`__proto__` metadata key (mirroring `:56-59`); each metadata value kind
including `null`, a nested object and an array; BOM stripping; malformed JSON as
a single rejection with no diagnostics; a non-array top level.

**Seam** — at least one test that feeds `planImport` a hand-built
`ImportResult` literal. Today `src/domain/domain.test.ts:31`'s `csv()` helper
means *every* `planImport` test routes through `parseCsv`, so the seam's
format-neutrality is currently claimed rather than proven.

**Equivalence (`R-JS-6.2`)** — a CSV document and a JSON document describing the
same accounts, asserting identical accounts, counts and codes, with the padding
and numeric exceptions asserted explicitly rather than skipped.

**Round trip (`R-JS-6.1`)** — export JSON, re-import, compare; include a
password with leading and trailing whitespace, an embedded newline and a quote.

**Pinning (`src/background/service.test.ts`)** — `EXPORT_ACCOUNTS` from
`popup.html` refused with the exact message, for both formats; a deliberately
misspelled `PAGE_PINS` key fails `npm run typecheck`.

**Acceptance (`tests/browser/run.mjs`)** — a JSON upload through the real file
chooser and a JSON export download parsed back. Note `:1023` uses
`getByRole('button', { name: 'Export CSV', exact: true })`, which survives the
two-button change; it should not be "fixed" preemptively.

## Performance budget

No worse than CSV at identical ceilings. All commands serialize through
`this.tail` (`src/background/service.ts:340-345,357`), so a synchronous
`JSON.parse` of 2 MiB plus up to 10⁶ metadata key operations blocks every other
command for its duration — but `Papa.parse` has exactly the same exposure today
at the same ceilings, so this adds no new class of risk. The three boundary
tests are the evidence; if any exceeds the CSV equivalent by more than a factor
of two, treat it as a defect rather than accepting it.

## Out of Scope

- Nested metadata, arrays as metadata values, any schema beyond flat scalars.
- Exporting profiles, catalog rules, title rules, history or the group list.
- Backup and restore of the vault.
- JSON Lines, NDJSON, YAML, streaming parse.
- Format auto-detection from file contents.
- A sample JSON file; the packaged sample stays CSV.
- A published JSON schema or shipped validator.
- Detecting duplicate keys inside a single JSON record.
- Renaming `CsvGroup` or `'CSV group name'`; recorded as `@debt` instead.
- Any change to CSV parsing, CSV export bytes, merge/replace semantics, the
  existing ceilings, or the autofill path.
