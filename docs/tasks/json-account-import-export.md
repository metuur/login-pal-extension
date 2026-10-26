# JSON Account Import and Dual-Format Export — Tasks

> Sections follow the EARS units in `docs/ears/json-account-import-export.md`.
> Ordering is carried by `deps:`, not by section order. Three orderings are
> load-bearing: story 1.1 precedes 2.2 because renaming a page-pinned command
> before the pin is typed can expose plaintext passwords; 2.1 precedes every
> parser story because it defines their return type; and section 8 waits for
> Chrome Web Store approval of v1, per Sequencing in
> `docs/hld/json-account-import-export.md`.
>
> `npm run check` is `typecheck && test && build` and **excludes**
> `test:browser`. Story 2.2 changes a required field on a command that
> `tests/browser/run.mjs` sends from plain JS at `:178`, `:195`, `:395` and
> `:1085`. `npm run test:browser` is mandatory before merging 2.2 and 6.3.
>
> `npm test` was `vitest run --root .`, which globbed `.test.mjs` files out of
> `.claude/skills/` and `.agents/skills/` — installed agent skills living inside
> the repo. 102 of them failed with "No test suite found", so `check` exited
> non-zero no matter what the project's own tests did. Scoped to `--dir src` in
> b4fc859 so the gate means something again.
>
> `npm run lint` is red at `HEAD` for an unrelated reason: `src/domain/rules.ts`
> carries pre-existing prettier drift. Not touched by this feature.
>
> `npm run test:browser` is **intermittently flaky**: one run in four failed
> during this work and the failure could not be reproduced across three
> subsequent runs. Treat a single red run as inconclusive and re-run before
> investigating. The suite reports 58 checks.

## Command pinning integrity

- [x] 1.1 Type the page-pin declaration (est: ~45m) (mutex: worker-dispatch)
  - why: The pin that keeps plaintext-password export off the popup surface compares a string literal no compiler checks — `src/background/service.ts:316` reads `message.type` while the guard at `:295-301` narrows it only to `string`, so a stale literal survives `typecheck` with the pin dead.
  - acceptance: R-JS-7.1, R-JS-7.2, R-JS-7.4 — One `PAGE_PINS` declaration keyed by `Command['type']` replaces both blocks at `:314-319` and `:320-325`; export stays pinned to `options.html` and fill to `popup.html`; each pin carries its own safe message.
  - verify: A key outside the `Command` union fails `npm run typecheck` — TS2353 for an unrelated name, TS2561 for a near-miss that TypeScript offers a suggestion for. Export requested from `popup.html` and from a web origin are both refused. Confirm `src/background/groups.ts:209-216`, which shares the `{ type: string }` cast, routes through the same declaration.
  - landed: 9ae4a5b — src/background/service.ts

- [x] 1.2 Assert pin refusals by message (deps: 1.1, est: ~20m) (mutex: worker-tests)
  - why: `src/background/service.test.ts:453-460` asserts only `.ok === false`, which a broken pin also satisfies, because a stale type falls through to the bare `throw` at `src/background/service.ts:609`. The test passes on the exact defect it exists to catch.
  - acceptance: R-JS-7.3 — Every page-pin test asserts that pin's own error string.
  - verify: Break the pin deliberately and confirm the suite fails; restore and confirm it passes. Done — mutating the lookup to never match failed 2 tests. Under the old `.ok` assertions the fill case would still have been caught (it returned `ok: true`), but the export case would not: it returned `ok: false` with the generic dispatch error. The export pin, the one guarding plaintext passwords, was the unprotected half.
  - landed: 96aae89 — src/background/service.test.ts

## Import contracts

- [x] 2.1 Rename the result and diagnostic contracts (deps: 1.1, est: ~40m) (mutex: shared-types)
  - why: A second parser makes `CsvResult` a lie, and `RowDiagnostic.row` already carries two disjoint meanings — a physical CSV file line computed before the blank-record filter at `src/domain/csv.ts:86-87` versus a JSON array index — so the unit has to live in the type instead of in a UI branch.
  - acceptance: LLD "Type changes" — `CsvResult` → `ImportResult`; `RowDiagnostic` → `ImportDiagnostic { at, unit, code }`; `ImportDiagnosticCode` replaces bare `string`; `AccountFormat` added; a `@debt` marker at `src/shared/types.ts:128` records that `CsvGroup` is deliberately left CSV-named.
  - verify: `npm run check` clean, exit 0. `src/options/index.ts:1002` renders the capitalized unit with the position and code, with no format branch. `src/domain/domain.test.ts:332` updated and now also asserts the unit. Probed that `ImportDiagnosticCode` is enforced: a bogus code raises TS2322 rather than widening to `string`.
  - landed: b37fa34 — src/shared/types.ts, src/domain/csv.ts, src/domain/import.ts, src/options/index.ts, src/domain/domain.test.ts

- [x] 2.2 Carry the format explicitly on both commands (deps: 2.1, est: ~50m) (mutex: shared-types, worker-dispatch)
  - why: The worker holds the decrypted vault and must not guess the type of a file it was handed; the export command must name what it is serializing.
  - acceptance: R-JS-4.1, R-JS-4.2, R-JS-4.3, R-JS-4.4 — `PREVIEW_IMPORT` gains `format`; `EXPORT_CSV` is extracted from the grouped member at `src/shared/types.ts:169` into `EXPORT_ACCOUNTS { format }`; both validate the format at the worker; no code path infers format from file contents.
  - verify: `npm run check` exit 0; `npm run test:browser` exit 0, 58 checks. Probe confirmed a misspelled pin key raises TS2561. The four `tests/browser/run.mjs` call sites had shifted to `:199`, `:221`, `:421`, `:1112`; all updated. No raw `EXPORT_CSV` literal existed in that file — its export path goes through the UI button. The `json` branches throw bare errors until `parseJson` is wired (3.1+) and `exportJson` exists (8.1).
  - landed: e8c6a62 — src/shared/types.ts, src/background/service.ts, src/background/service.test.ts, src/options/index.ts, tests/browser/run.mjs

## JSON document acceptance

- [x] 3.1 Parse a JSON account document (deps: 2.1, est: ~45m) (mutex: domain-parsers)
  - why: Accept fixtures that already exist as JSON without a conversion step, refusing a malformed or wrongly shaped document whole so the user gets one cause instead of ten thousand.
  - acceptance: R-JS-1.1, R-JS-1.2, R-JS-1.3 — `src/domain/json.ts` exporting `parseJson(bytes): ImportResult`; UTF-8 decode with a leading BOM stripped before `JSON.parse`; malformed JSON becomes one whole-document rejection with no per-record diagnostics; a non-array top level is rejected.
  - verify: Done — 8 tests covering BOM, malformed JSON, top-level object, top-level string, empty array, 3-element array, the 2 MiB ceiling and invalid UTF-8. Document-level failures throw named messages rather than returning diagnostics, matching `parseCsv`.
  - landed: 6b5e93f — src/domain/json.ts, src/domain/domain.test.ts

- [x] 3.2 Enforce the document ceilings (deps: 3.1, est: ~35m) (mutex: domain-parsers)
  - why: A second import format must not open a hole in the limits that protect storage, and a wide record must be refused the way CSV refuses a wide header rather than inventing a per-record code.
  - acceptance: R-JS-1.4, R-JS-1.5 — Over 100 own keys in any record rejects the whole document, matching `src/domain/csv.ts:88-89`; the R-2.7 ceilings apply with "data rows" read as elements of the top-level array.
  - verify: Done — boundary tests mirroring the CSV ceilings: exactly 10,000 records accepted / 10,001 rejected, exactly 100 own keys accepted / 101 rejected. Arrays are excluded from the width check, since they are `typeof 'object'` and a long array element would otherwise reject the whole document instead of reporting itself as `RECORD_NOT_OBJECT`.
  - landed: 7503910 — src/domain/json.ts, src/domain/boundaries.test.ts, src/domain/domain.test.ts

- [x] 3.3 Align the vault size-limit message (est: ~15m) (mutex: worker-dispatch)
  - why: `src/background/service.ts:271` throws `'Vault size limit.'`, which is absent from `SAFE_ERRORS`, while the allowlisted string is `'Vault exceeds the 5 MiB encrypted storage limit.'` at `:141`. R-JS-1.5 depends on that path naming its cause, and the gap predates this feature.
  - acceptance: R-JS-1.5 — The 5 MiB envelope rejection reaches the user as its specific message, not the generic failure text.
  - verify: Done — a test drives two real import cycles until the encrypted envelope passes 5 MiB and asserts the specific message. Discovery: the worker-side check is **unreachable**. `encryptVault` (`src/domain/crypto.ts:194`) computes the identical byte length against the identical threshold and throws before returning, so `write()` can never observe an oversized envelope. The line was left in place as a second guard, now agreeing with the first rather than contradicting it. Removing it is its own decision, not this story's.
  - landed: 06e79c7 — src/background/service.ts, src/background/service.test.ts

- [x] 3.4 Name every JSON rejection cause safely (deps: 3.1, 3.2, est: ~25m) (mutex: worker-dispatch)
  - why: An unlisted message degrades to generic text, and the current bare `throw new Error()` for invalid preview shapes at `src/background/service.ts:485-492` already lands there.
  - acceptance: R-JS-1.6 — The seven strings enumerated in the LLD "Safe messages" section are added to `SAFE_ERRORS`, and no JSON rejection echoes document contents, field values or passwords.
  - verify: Done — grep cross-check confirms all six strings `parseJson` throws are in `SAFE_ERRORS` verbatim, plus `'Choose a supported file format.'`. **Scope grew by one step:** the story also wires `parseJson` into the `PREVIEW_IMPORT` dispatch, replacing the placeholder bare throw left by 2.2. Without the wiring the messages are unreachable and the allowlist cannot be verified at all.
  - landed: 4b3b204 — src/background/service.ts, src/background/service.test.ts

## JSON record validation

- [x] 4.1 Validate records in CSV's diagnostic order (deps: 3.1, est: ~50m) (mutex: domain-parsers)
  - why: One bad record must not block a usable file, and a record has to be judged by the same rules and in the same order CSV already applies, or the two formats drift into different definitions of a valid account.
  - acceptance: R-JS-2.1, R-JS-2.2, R-JS-2.4, R-JS-2.5 — Non-object elements yield `RECORD_NOT_OBJECT`; absent or non-string reserved keys yield `REQUIRED_FIELD_NOT_STRING`; the ladder runs `DUPLICATE_ACCOUNT_ID` first as at `src/domain/csv.ts:101-112`; at most one code per record; position is the 1-based array index labelled as a record.
  - verify: One test per code. Diagnostics never contain field values. **Corrected acceptance:** the original line asked for a record that is both duplicate and non-object, which is unconstructible — duplicate detection requires reading a string `account_id`, which can only exist on an object, so the two conditions are mutually exclusive. Ladder order is proven instead against the next achievable pairing, a duplicate record whose `username` is a number, resolving to `DUPLICATE_ACCOUNT_ID` over `REQUIRED_FIELD_NOT_STRING`.
  - landed: 7503910 — src/domain/json.ts, src/domain/domain.test.ts, src/shared/types.ts

- [x] 4.2 Count duplicates only for real identifiers (deps: 4.1, est: ~20m) (mutex: domain-parsers)
  - why: `src/domain/csv.ts:93` guards its frequency map with `if (id)`. Without the same guard, three records with an empty `account_id` all report `DUPLICATE_ACCOUNT_ID` where CSV reports `EMPTY_ACCOUNT_ID`, breaking the equivalence claim.
  - acceptance: R-JS-2.3 — The frequency map counts only non-empty trimmed string identifiers; absent, non-string and empty identifiers report their own cause.
  - verify: Done — three with `""` report `EMPTY_ACCOUNT_ID`, three with the key absent and three with a numeric identifier report `REQUIRED_FIELD_NOT_STRING`. None reports `DUPLICATE_ACCOUNT_ID`.
  - landed: 7503910 — src/domain/json.ts, src/domain/domain.test.ts

## Metadata values

- [x] 5.1 Coerce scalar metadata to text (deps: 3.1, est: ~40m) (mutex: domain-parsers)
  - why: The vault accepts only flat string metadata, and rejecting numbers outright would refuse ordinary QA fixtures like `{"port": 8080}` that CSV accepts as text.
  - acceptance: R-JS-3.1, R-JS-3.2, R-JS-3.3, R-JS-3.4, R-JS-3.5, R-JS-3.7 — Non-reserved keys become metadata; strings stored unchanged; numbers and booleans stored as `String(value)`; null stored as `''`; every value stored and rendered as text; the numeric-spelling limitation is documented where users will meet it.
  - verify: Done — each kind round-trips. The limitation is asserted against exact outputs: `12345678901234567890` → `'12345678901234567000'`, `1e21` → `'1e+21'`, `-0` → `'0'`. Tests are built from raw JSON text rather than `JSON.stringify`, since JS number literals would round before the parser ever saw them.
  - landed: da91373 — src/domain/json.ts, src/domain/domain.test.ts

- [x] 5.2 Reject non-scalar metadata values (deps: 5.1, est: ~20m) (mutex: domain-parsers)
  - why: Flattening an array or object would invent a representation the user never wrote, and `validPayload` at `src/domain/crypto.ts:117` would reject it at write time anyway — later, and less legibly.
  - acceptance: R-JS-3.6 — An array or object metadata value marks the record invalid with `METADATA_VALUE_NOT_SCALAR`, with no flattening or stringification.
  - verify: Done — both invalid with `METADATA_VALUE_NOT_SCALAR`, slotted last in the ladder so the one-code-per-record rule holds; a third valid record in the same document still imports.
  - landed: da91373 — src/domain/json.ts, src/shared/types.ts, src/domain/domain.test.ts

- [x] 5.3 Build metadata without touching a prototype (deps: 5.1, est: ~15m) (mutex: domain-parsers)
  - why: `JSON.parse` makes `__proto__` an own property on the parsed record, so the hazard is the object being built — `metadata['__proto__'] = v` on a `{}` literal invokes the prototype setter. `src/domain/csv.ts:117-121` is safe only because it uses `Object.fromEntries`.
  - acceptance: R-JS-3.8 — Metadata is constructed by own-property assignment that cannot invoke a setter, so a `__proto__` key becomes an ordinary entry.
  - verify: Done. Satisfied by the `Object.fromEntries` construction 5.1 introduced, mirroring `src/domain/csv.ts:117-121`; no separate change was needed. The test is written from raw JSON text because a JS object literal `{ __proto__: v }` sets the prototype instead of creating an own property, which would have made the test vacuous.
  - landed: da91373 — src/domain/json.ts, src/domain/domain.test.ts

## Import format selection

- [x] 6.1 Accept JSON in the Settings file picker (deps: 2.2, 5.1, est: ~45m) (mutex: options-import)
  - why: The UI is the only layer that knows the filename, so it is where the format is declared and where a mislabelled file is refused before the worker sees it.
  - acceptance: R-JS-4.5, R-JS-4.6 — `accept` at `src/options/index.ts:115` widened to `.csv,.json,text/csv,application/json`; format derived from the extension at `:898-904`; any other extension refused with the accepted list named and no preview request sent; `src/shared/formats.ts` holds extension, MIME, label and diagnostic unit.
  - verify: Done — `npm run test:browser` exit 0. Format is set only in the file-input change listener, which already calls `invalidatePreview()`, and is reset alongside every existing `file = undefined` site. No fifth trigger added, as specified.
  - landed: 81258e5 — src/shared/formats.ts, src/options/index.ts

- [x] 6.2 Name the validated format in review (deps: 6.1, est: ~25m) (mutex: options-import)
  - why: The review step is the last point before a commit that cannot be undone, so it must state what was actually validated rather than what was chosen.
  - acceptance: R-JS-4.7 — The review panel names the validated format beside the file name, and diagnostics render `${d.unit} ${d.at}: ${d.code}` from the descriptor with no format branch.
  - verify: Done — the review panel reads e.g. `accounts.json · JSON`. The diagnostics renderer was already format-neutral from story 2.1 and was left untouched; no branch was added.
  - landed: 81258e5 — src/options/index.ts

- [x] 6.3 Reword format-specific microcopy (deps: 6.1, est: ~25m) (mutex: options-import)
  - why: Six strings become false the moment `.json` is accepted, and a user who reads "Choose an account CSV" above a picker that takes JSON will not try it.
  - acceptance: LLD "Microcopy" — `'Import CSV'` (`:292`), `'Choose an account CSV'` (`:118` and its reuses at `:101`, `:134`, `:901`, `:1027`, `:1386`, `:1399`), `'Choose a CSV file first.'` (`:909`), `${p.valid} valid rows` (`:962`), `${p.invalid} invalid rows will be excluded` (`:990-995`), `Row diagnostics (n)` (`:1000`). `'CSV group name'` (`:80`) and `'Download sample CSV (3 rows)'` (`:138`) are deliberately left alone.
  - verify: Done — exit 0. **My list was incomplete:** it omitted the section heading `'↥ Import CSV dataset'` and the `'Upload another CSV'` button, which would have left a CSV-only heading above a picker that accepts JSON. Both reworded, with the matching `tests/browser/run.mjs` assertions and the README reference. `'CSV group name'` and `'Download sample CSV (3 rows)'` stay as specified.
  - landed: 81258e5 — src/options/index.ts, tests/browser/run.mjs, README.md

- [x] 6.4 Widen the directory ownership contracts (deps: 5.1, est: ~25m) (mutex: agents-docs)
  - why: Two `AGENTS.md` files grant the password carve-out in CSV-only terms, so as written neither authorizes Settings or the worker to handle exported JSON containing passwords. The grant has to be widened explicitly, not inherited.
  - acceptance: LLD "Documentation ownership" — `src/options/AGENTS.md` and `src/background/AGENTS.md` carve-outs cover exported text in any account format; `src/domain/AGENTS.md` no longer reads "Pure CSV/…"; `docs/ears/account-login-assistant.md:45` Unit 2 heading becomes format-neutral; `src/domain/json.ts` carries `@spec R-JS-1.1..R-JS-3.8`.
  - verify: Done — `grep -rn "CSV" src/*/AGENTS.md` now returns zero hits. `src/shared`, `src/content`, `preview`, `tests/browser` and the root `AGENTS.md` contain no CSV wording at all, so none needed changing. **Found one file the story did not list:** `src/background/AGENTS.md` carries its own copy of the same carve-out, so two files granted the exception in CSV-only terms, not one.
  - landed: 69407a9 — src/options/AGENTS.md, src/background/AGENTS.md, src/domain/AGENTS.md, docs/ears/account-login-assistant.md

## Round-trip fidelity

- [x] 7.1 Prove the seam is format-neutral (deps: 4.1, est: ~30m) (mutex: domain-tests)
  - why: `src/domain/domain.test.ts:31`'s `csv()` helper means every `planImport` test currently routes through `parseCsv`, so the central architectural claim of this design is asserted nowhere.
  - acceptance: LLD "Test plan" — At least one test feeds `planImport` a hand-built `ImportResult` literal and asserts merge behaviour without invoking either parser.
  - verify: Done — the literal carries deliberately nonsensical `found`/`valid`/`invalid`/`diagnostics`, so the test fails the moment `planImport` reads anything but `.accounts`.
  - landed: f402952 — src/domain/domain.test.ts

- [x] 7.2 Assert CSV and JSON equivalence (deps: 4.2, 5.2, est: ~40m) (mutex: domain-tests)
  - why: The claim that both formats describe the same accounts the same way is the one most likely to be assumed rather than checked, and it is false in two known places.
  - acceptance: R-JS-6.2 — A CSV document and a JSON document describing the same accounts produce identical accounts, counts and codes, with the metadata-padding difference and the `R-JS-3.4` numeric exception asserted explicitly rather than skipped.
  - verify: Done — 7 paired records, comparing codes and ordering rather than positions, since CSV counts physical lines and JSON counts array indices. Both exceptions asserted: CSV pads an absent `company` key with `''` where JSON omits it, and CSV keeps `'0042'` verbatim where JSON coerces `42` through `String()` and loses the leading zero. No third divergence found.
  - landed: f402952 — src/domain/domain.test.ts

- [x] 7.3 Preserve awkward values across re-import (deps: 7.2, est: ~25m) (mutex: domain-tests)
  - why: Commas, quotes, newlines and non-ASCII are exactly the values a format conversion loses, and passwords are the field where a silent loss is unrecoverable.
  - acceptance: R-JS-6.3 — Metadata containing commas, double quotes, newlines and non-ASCII survives an export and re-import in either format.
  - verify: **Fully satisfied as of 2026-10-26.** Both halves are covered: the CSV export/re-import round trip, and the JSON one once `exportJson` landed with story 8.1. The JSON test was rewritten from a `parseJson`-only leg into a real export-then-re-import, so R-JS-6.3 is now met in either format.
  - landed: f402952 — src/domain/domain.test.ts; JSON half completed 2026-10-26

## Dual-format export

> Built on 2026-10-26 at the user's request. The hold was on *submitting*, not on
> building: a new version must still not be submitted while another is in review.
> `docs/store-listing.md` now names both formats, so the listing and the product
> agree the moment this is published.

- [x] 8.1 Serialize a group as JSON (deps: 2.2, est: ~35m) (mutex: domain-parsers)
  - why: Let a group feed a tool that reads JSON without a conversion step, and preserve each record as stored rather than padding it into a rectangle.
  - acceptance: R-JS-5.3, R-JS-5.4, R-JS-5.5, R-JS-5.7 — `exportJson(accounts)` emits a top-level array in stored order, reserved keys then own metadata keys sorted, absent keys omitted rather than padded, two-space indentation, a trailing newline and no BOM; `exportCsv` output is unchanged byte for byte.
  - verify: Assert CSV export bytes against a stored expectation. Assert a JSON export omits a key absent from one account while the CSV export pads it.
  - landed: 2026-10-26 — `exportJson` in `src/domain/json.ts`. Reserved keys then own metadata keys sorted, absent keys omitted, two-space indent, trailing newline, no BOM. CSV export bytes are now pinned by a stored-expectation test, so a second format cannot reshape the first.

- [x] 8.2 Offer both export formats in Settings (deps: 8.1, est: ~40m) (mutex: options-export)
  - why: The user picks the shape at the moment of export, not in a setting configured beforehand.
  - acceptance: R-JS-5.1, R-JS-5.2, R-JS-5.6 — Two buttons each send `EXPORT_ACCOUNTS` with their format and reuse the download mechanics at `src/options/index.ts:1104-1136`; the filename extension matches the format; the 2026-10-05 export amendment's filter independence, group isolation, exclusions and transient handling apply to both.
  - verify: `npm run test:browser` exports both formats and parses each back. `tests/browser/run.mjs:1023` uses `exact: true`, so it survives the second button unchanged — do not "fix" it.
  - landed: 2026-10-26 — Settings builds one button per entry in `FORMATS`, so both share the single download path, and the filename extension and blob MIME type come from the same descriptor. Export remains Settings-only, filter-independent and group-isolated. `tests/browser/run.mjs` exports both and compares them account for account.

- [x] 8.3 Round-trip an exported JSON group (deps: 8.1, est: ~25m) (mutex: domain-tests)
  - why: An export that cannot be imported back is a dead end, and this is the requirement that makes the guarantee testable rather than assumed.
  - acceptance: R-JS-6.1 — A group exported as JSON and imported into an empty group reproduces every account with byte-identical passwords, identical identifiers and usernames, and the same metadata keys and values.
  - verify: Export, re-import, compare account by account, including a password with leading and trailing whitespace, an embedded newline and a quote.
  - landed: 2026-10-26 — `exportJson` → `parseJson` reproduces every account exactly (`toEqual` on the whole array), including a password with leading/trailing whitespace, an embedded newline and a quote. The story 7.3 test that could only exercise parseJson's half is now a real export round trip.

- [x] 8.4 Update the store listing for the second format (deps: 8.2, est: ~15m) (mutex: store-listing)
  - why: `docs/store-listing.md` states the single purpose as "importing and exporting the CSV", which stops being true, and the single-purpose field is the one reviewers read first.
  - acceptance: Single-purpose and detailed descriptions name both formats; data-usage disclosures re-checked against the unchanged answer, since no new data type is handled.
  - verify: Submit as an update, never while another version is in review.
  - landed: 2026-10-26 — Single-purpose, short and detailed descriptions, the storage justification and the PII disclosure all name both formats. No new data type is handled, so the data-usage answers are unchanged. Not yet submitted.
