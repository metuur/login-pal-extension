# JSON Account Import and Dual-Format Export — High-Level Design

## Overview

Login Pal accepts synthetic QA accounts from one file format, CSV, and emits
one format, CSV. This change adds JSON as a second accepted import format and a
second export format, so a group can be populated from a JSON document and
downloaded as either CSV or JSON. The accounts themselves, the merge/replace
semantics, the encrypted vault, the catalog rules and the login profiles are
unchanged — only the edges of the pipeline learn a second format.

The split that makes this tractable already exists in the code. `parseCsv`
(`src/domain/csv.ts:54-131`) is the only function that knows what a CSV is, and
it hands a neutral result to `planImport` (`src/domain/import.ts:32-101`), which
reads nothing but the parsed account list and its counters. This change adds a
sibling parser beside `parseCsv` and a sibling serializer beside `exportCsv`,
then makes format an explicit parameter on the two commands that currently
assume it.

## Stakeholders & Impact

**QA and support engineers using the extension.** Today every account fixture
must be CSV before Login Pal will accept it, so fixtures that originate as JSON
are converted first. After this ships those documents import directly, and a
group can be exported as JSON to feed another tool without a conversion step.

> **Unverified premise.** No ticket, user report or named fixture file
> establishes that anyone is currently doing that conversion. This feature was
> specified because it was asked for, not because demand was measured. The
> cheapest alternative that satisfies the same need is a `jq` recipe in the
> README, at roughly five lines. If no real JSON fixture can be named, prefer
> that and close this design unimplemented.

**Anyone exporting a group with structured metadata.** CSV flattens every
metadata column to text and pads absent keys with an empty string, so an
exported CSV cannot distinguish "this account has no `role`" from "this
account's `role` is empty". JSON export omits absent keys, so a JSON round trip
preserves each record as it was imported.

**No impact on the autofill path.** Field detection, filling, success
detection, host permissions and the content script are untouched. The data they
read is the same `Account` shape regardless of which file produced it.

**No impact on existing CSV users.** Every current CSV import and export keeps
working with the same limits, the same diagnostics and the same merge
semantics. CSV remains the format of the packaged sample file.

## Goals

- A group can be populated from a JSON document containing synthetic accounts,
  through the same two-stage preview-then-confirm flow the CSV import uses.
- A JSON import is subject to the same ceilings, the same duplicate-ID rule,
  the same trimming policy and the same failure-preservation guarantees as a CSV
  import.
- A group can be downloaded as CSV or as JSON, with the format chosen
  explicitly by the user at the moment of export.
- A group exported as JSON and re-imported reproduces the same accounts,
  including metadata keys and exact password bytes.
- Invalid records in a JSON document are reported by record position and a
  safe code, never by echoing the record's contents.
- The format of an import is stated by the caller, never inferred by the
  background worker from file contents.

## Non-Goals

- Nested or non-scalar metadata. A metadata value that is an array or an object
  makes its record invalid. The vault's account contract requires a flat
  `Record<string, string>` (`src/domain/crypto.ts:117`) and that contract does
  not change.
- Exporting anything beyond accounts. Catalog rules, login profiles, title
  rules, fill history and the group list stay out of both export formats.
- A backup or restore feature. Neither format carries the vault, the key, the
  profile or the history, so neither export is a backup.
- JSON Lines, NDJSON, streaming parse, or any format other than a single JSON
  document.
- Format auto-detection by sniffing file contents.
- Changing the packaged sample file, which stays CSV.
- Any change to CSV parsing, CSV export, merge/replace semantics, limits, or
  the login/autofill path.

## Success Criteria

- Importing a JSON document of synthetic accounts into an empty group produces
  the same accounts, counts and preview as importing the equivalent CSV.
- Importing the same JSON document twice reports every record as `unchanged` on
  the second pass.
- Exporting a group as JSON and importing that file into an empty group yields
  byte-identical passwords and the same metadata keys per account.
- A JSON document that exceeds a ceiling, is not an array, or contains
  non-scalar metadata is rejected or reports invalid records without altering
  the stored vault.
- A JSON document whose records duplicate an account ID marks every occurrence
  of that ID invalid, matching the CSV rule.
- Exporting as CSV produces exactly the bytes it produces today.
- The Settings page offers both export formats and accepts both import formats,
  and no part of the UI implies JSON is the default.
- A command type absent from the command union fails to compile in the
  page-pinning declaration, and a page-pinned refusal is verified by its message
  rather than by the request merely failing.

## Sequencing

Three phases, in this order, for reasons that are not stylistic:

1. **Page-pin hardening.** Independent of JSON. The current pin compares a
   string literal no compiler checks, so renaming the export command before this
   lands can silently expose plaintext passwords to the popup. Fix first,
   separately, on its own merit.
2. **JSON import.** The whole of the first goal. Ships without touching the
   export surface.
3. **JSON export.** Deferred until the Chrome Web Store has approved v1.
   Submitting a new version while one is in review replaces the pending item and
   forfeits accrued queue time, and `docs/store-listing.md` describes the
   single purpose as "importing and exporting the CSV" — a sentence that stays
   true for as long as export stays CSV-only.
