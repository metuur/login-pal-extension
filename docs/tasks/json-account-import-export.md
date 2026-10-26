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

- [ ] 3.2 Enforce the document ceilings (deps: 3.1, est: ~35m) (mutex: domain-parsers)
  - why: A second import format must not open a hole in the limits that protect storage, and a wide record must be refused the way CSV refuses a wide header rather than inventing a per-record code.
  - acceptance: R-JS-1.4, R-JS-1.5 — Over 100 own keys in any record rejects the whole document, matching `src/domain/csv.ts:88-89`; the R-2.7 ceilings apply with "data rows" read as elements of the top-level array.
  - verify: Boundary tests mirroring `src/domain/boundaries.test.ts:11-56` — exactly 10,000 records accepted and 10,001 rejected, exactly 100 keys accepted and 101 rejected, exactly 2 MiB accepted and one byte more rejected.
  - landed:

- [ ] 3.3 Align the vault size-limit message (est: ~15m) (mutex: worker-dispatch)
  - why: `src/background/service.ts:271` throws `'Vault size limit.'`, which is absent from `SAFE_ERRORS`, while the allowlisted string is `'Vault exceeds the 5 MiB encrypted storage limit.'` at `:141`. R-JS-1.5 depends on that path naming its cause, and the gap predates this feature.
  - acceptance: R-JS-1.5 — The 5 MiB envelope rejection reaches the user as its specific message, not the generic failure text.
  - verify: Drive a write past 5 MiB and assert the returned message.
  - landed:

- [ ] 3.4 Name every JSON rejection cause safely (deps: 3.1, 3.2, est: ~25m) (mutex: worker-dispatch)
  - why: An unlisted message degrades to generic text, and the current bare `throw new Error()` for invalid preview shapes at `src/background/service.ts:485-492` already lands there.
  - acceptance: R-JS-1.6 — The seven strings enumerated in the LLD "Safe messages" section are added to `SAFE_ERRORS`, and no JSON rejection echoes document contents, field values or passwords.
  - verify: Assert each rejection path returns its own message verbatim. Grep the new parser for any thrown string absent from the allowlist.
  - landed:

## JSON record validation

- [ ] 4.1 Validate records in CSV's diagnostic order (deps: 3.1, est: ~50m) (mutex: domain-parsers)
  - why: One bad record must not block a usable file, and a record has to be judged by the same rules and in the same order CSV already applies, or the two formats drift into different definitions of a valid account.
  - acceptance: R-JS-2.1, R-JS-2.2, R-JS-2.4, R-JS-2.5 — Non-object elements yield `RECORD_NOT_OBJECT`; absent or non-string reserved keys yield `REQUIRED_FIELD_NOT_STRING`; the ladder runs `DUPLICATE_ACCOUNT_ID` first as at `src/domain/csv.ts:101-112`; at most one code per record; position is the 1-based array index labelled as a record.
  - verify: One test per code. A record that is both duplicate and non-object reports the duplicate. Diagnostics never contain field values.
  - landed:

- [ ] 4.2 Count duplicates only for real identifiers (deps: 4.1, est: ~20m) (mutex: domain-parsers)
  - why: `src/domain/csv.ts:93` guards its frequency map with `if (id)`. Without the same guard, three records with an empty `account_id` all report `DUPLICATE_ACCOUNT_ID` where CSV reports `EMPTY_ACCOUNT_ID`, breaking the equivalence claim.
  - acceptance: R-JS-2.3 — The frequency map counts only non-empty trimmed string identifiers; absent, non-string and empty identifiers report their own cause.
  - verify: Three records with `""`, three with the key absent, and three with a numeric identifier each report the expected non-duplicate code.
  - landed:

## Metadata values

- [ ] 5.1 Coerce scalar metadata to text (deps: 3.1, est: ~40m) (mutex: domain-parsers)
  - why: The vault accepts only flat string metadata, and rejecting numbers outright would refuse ordinary QA fixtures like `{"port": 8080}` that CSV accepts as text.
  - acceptance: R-JS-3.1, R-JS-3.2, R-JS-3.3, R-JS-3.4, R-JS-3.5, R-JS-3.7 — Non-reserved keys become metadata; strings stored unchanged; numbers and booleans stored as `String(value)`; null stored as `''`; every value stored and rendered as text; the numeric-spelling limitation is documented where users will meet it.
  - verify: Values of each kind round-trip to the expected string. Assert the documented limitation explicitly for an integer beyond 2^53, an exponent-form number and negative zero, rather than skipping them.
  - landed:

- [ ] 5.2 Reject non-scalar metadata values (deps: 5.1, est: ~20m) (mutex: domain-parsers)
  - why: Flattening an array or object would invent a representation the user never wrote, and `validPayload` at `src/domain/crypto.ts:117` would reject it at write time anyway — later, and less legibly.
  - acceptance: R-JS-3.6 — An array or object metadata value marks the record invalid with `METADATA_VALUE_NOT_SCALAR`, with no flattening or stringification.
  - verify: A record with a nested object and one with an array are both invalid; neither contributes an account; the rest of the document still imports.
  - landed:

- [ ] 5.3 Build metadata without touching a prototype (deps: 5.1, est: ~15m) (mutex: domain-parsers)
  - why: `JSON.parse` makes `__proto__` an own property on the parsed record, so the hazard is the object being built — `metadata['__proto__'] = v` on a `{}` literal invokes the prototype setter. `src/domain/csv.ts:117-121` is safe only because it uses `Object.fromEntries`.
  - acceptance: R-JS-3.8 — Metadata is constructed by own-property assignment that cannot invoke a setter, so a `__proto__` key becomes an ordinary entry.
  - verify: Mirror `src/domain/domain.test.ts:56-59` for JSON — assert `Object.hasOwn(metadata, '__proto__')` and that no prototype was mutated.
  - landed:

## Import format selection

- [ ] 6.1 Accept JSON in the Settings file picker (deps: 2.2, 5.1, est: ~45m) (mutex: options-import)
  - why: The UI is the only layer that knows the filename, so it is where the format is declared and where a mislabelled file is refused before the worker sees it.
  - acceptance: R-JS-4.5, R-JS-4.6 — `accept` at `src/options/index.ts:115` widened to `.csv,.json,text/csv,application/json`; format derived from the extension at `:898-904`; any other extension refused with the accepted list named and no preview request sent; `src/shared/formats.ts` holds extension, MIME, label and diagnostic unit.
  - verify: Upload `.csv`, `.json` and a third extension. Confirm format is **not** wired as a fifth preview-invalidation trigger — it is derived from the file selection, which already invalidates, so a fifth condition could never fire independently.
  - landed:

- [ ] 6.2 Name the validated format in review (deps: 6.1, est: ~25m) (mutex: options-import)
  - why: The review step is the last point before a commit that cannot be undone, so it must state what was actually validated rather than what was chosen.
  - acceptance: R-JS-4.7 — The review panel names the validated format beside the file name, and diagnostics render `${d.unit} ${d.at}: ${d.code}` from the descriptor with no format branch.
  - verify: A JSON preview reads "record", a CSV preview reads "row", and neither path branches on format in the renderer.
  - landed:

- [ ] 6.3 Reword format-specific microcopy (deps: 6.1, est: ~25m) (mutex: options-import)
  - why: Six strings become false the moment `.json` is accepted, and a user who reads "Choose an account CSV" above a picker that takes JSON will not try it.
  - acceptance: LLD "Microcopy" — `'Import CSV'` (`:292`), `'Choose an account CSV'` (`:118` and its reuses at `:101`, `:134`, `:901`, `:1027`, `:1386`, `:1399`), `'Choose a CSV file first.'` (`:909`), `${p.valid} valid rows` (`:962`), `${p.invalid} invalid rows will be excluded` (`:990-995`), `Row diagnostics (n)` (`:1000`). `'CSV group name'` (`:80`) and `'Download sample CSV (3 rows)'` (`:138`) are deliberately left alone.
  - verify: `npm run test:browser` with its string expectations updated in the same commit.
  - landed:

- [ ] 6.4 Widen the directory ownership contracts (deps: 5.1, est: ~25m) (mutex: agents-docs)
  - why: Two `AGENTS.md` files grant the password carve-out in CSV-only terms, so as written neither authorizes Settings or the worker to handle exported JSON containing passwords. The grant has to be widened explicitly, not inherited.
  - acceptance: LLD "Documentation ownership" — `src/options/AGENTS.md` and `src/background/AGENTS.md` carve-outs cover exported text in any account format; `src/domain/AGENTS.md` no longer reads "Pure CSV/…"; `docs/ears/account-login-assistant.md:45` Unit 2 heading becomes format-neutral; `src/domain/json.ts` carries `@spec R-JS-1.1..R-JS-3.8`.
  - verify: Grep all four `AGENTS.md` files for CSV-exclusive wording in the password and parser clauses.
  - landed:

## Round-trip fidelity

- [ ] 7.1 Prove the seam is format-neutral (deps: 4.1, est: ~30m) (mutex: domain-tests)
  - why: `src/domain/domain.test.ts:31`'s `csv()` helper means every `planImport` test currently routes through `parseCsv`, so the central architectural claim of this design is asserted nowhere.
  - acceptance: LLD "Test plan" — At least one test feeds `planImport` a hand-built `ImportResult` literal and asserts merge behaviour without invoking either parser.
  - verify: The new test passes with both parsers stubbed out of the import graph.
  - landed:

- [ ] 7.2 Assert CSV and JSON equivalence (deps: 4.2, 5.2, est: ~40m) (mutex: domain-tests)
  - why: The claim that both formats describe the same accounts the same way is the one most likely to be assumed rather than checked, and it is false in two known places.
  - acceptance: R-JS-6.2 — A CSV document and a JSON document describing the same accounts produce identical accounts, counts and codes, with the metadata-padding difference and the `R-JS-3.4` numeric exception asserted explicitly rather than skipped.
  - verify: The paired fixtures differ only in the two documented ways; any third divergence fails the test.
  - landed:

- [ ] 7.3 Preserve awkward values across re-import (deps: 7.2, est: ~25m) (mutex: domain-tests)
  - why: Commas, quotes, newlines and non-ASCII are exactly the values a format conversion loses, and passwords are the field where a silent loss is unrecoverable.
  - acceptance: R-JS-6.3 — Metadata containing commas, double quotes, newlines and non-ASCII survives an export and re-import in either format.
  - verify: Round-trip both formats with a password carrying leading and trailing whitespace, an embedded newline and a double quote.
  - landed:

## Dual-format export

> Hold this section until the Chrome Web Store has approved v1. Submitting a new
> version while one is in review replaces the pending item and forfeits accrued
> queue time, and `docs/store-listing.md` describes the single purpose as
> "importing and exporting the CSV" — true for as long as export stays CSV-only.

- [ ] 8.1 Serialize a group as JSON (deps: 2.2, est: ~35m) (mutex: domain-parsers)
  - why: Let a group feed a tool that reads JSON without a conversion step, and preserve each record as stored rather than padding it into a rectangle.
  - acceptance: R-JS-5.3, R-JS-5.4, R-JS-5.5, R-JS-5.7 — `exportJson(accounts)` emits a top-level array in stored order, reserved keys then own metadata keys sorted, absent keys omitted rather than padded, two-space indentation, a trailing newline and no BOM; `exportCsv` output is unchanged byte for byte.
  - verify: Assert CSV export bytes against a stored expectation. Assert a JSON export omits a key absent from one account while the CSV export pads it.
  - landed:

- [ ] 8.2 Offer both export formats in Settings (deps: 8.1, est: ~40m) (mutex: options-export)
  - why: The user picks the shape at the moment of export, not in a setting configured beforehand.
  - acceptance: R-JS-5.1, R-JS-5.2, R-JS-5.6 — Two buttons each send `EXPORT_ACCOUNTS` with their format and reuse the download mechanics at `src/options/index.ts:1104-1136`; the filename extension matches the format; the 2026-10-05 export amendment's filter independence, group isolation, exclusions and transient handling apply to both.
  - verify: `npm run test:browser` exports both formats and parses each back. `tests/browser/run.mjs:1023` uses `exact: true`, so it survives the second button unchanged — do not "fix" it.
  - landed:

- [ ] 8.3 Round-trip an exported JSON group (deps: 8.1, est: ~25m) (mutex: domain-tests)
  - why: An export that cannot be imported back is a dead end, and this is the requirement that makes the guarantee testable rather than assumed.
  - acceptance: R-JS-6.1 — A group exported as JSON and imported into an empty group reproduces every account with byte-identical passwords, identical identifiers and usernames, and the same metadata keys and values.
  - verify: Export, re-import, compare account by account, including a password with leading and trailing whitespace, an embedded newline and a quote.
  - landed:

- [ ] 8.4 Update the store listing for the second format (deps: 8.2, est: ~15m) (mutex: store-listing)
  - why: `docs/store-listing.md` states the single purpose as "importing and exporting the CSV", which stops being true, and the single-purpose field is the one reviewers read first.
  - acceptance: Single-purpose and detailed descriptions name both formats; data-usage disclosures re-checked against the unchanged answer, since no new data type is handled.
  - verify: Submit as an update, never while another version is in review.
  - landed:
