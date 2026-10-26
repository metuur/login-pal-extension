# JSON Account Import and Dual-Format Export — EARS Specifications

> Requirement IDs use the `R-JS-` prefix, following the house convention set by
> `docs/ears/localhost-application-identity.md` (`R-AI-`). `@spec` annotations
> cite bare IDs with no file qualifier, and the existing chain already carries a
> collision at `docs/ears/account-login-assistant.md:71` and `:112` (`R-2.21`
> defined twice), so a distinct prefix is required rather than extending
> `R-2.23+`.

> **Scope boundary.** This document specifies only what differs because the
> format is JSON. The format-independent import contract — ceilings, atomicity,
> failure preservation, revision and history effects, merge/replace semantics,
> preview invalidation, trimming policy, duplicate-ID handling and preview
> counts — remains `R-2.3`–`R-2.20` in `docs/ears/account-login-assistant.md`,
> which the 2026-10-23 amendment at the top of that file declares
> format-independent. Requirements are deliberately **not** restated here; a
> second copy is how `R-2.21` came to be defined twice.

## Unit 1: JSON document acceptance

**Why:** A malformed or wrongly shaped document must be refused whole, before
any record is examined and before the vault is touched, so the user gets one
clear cause instead of ten thousand per-record errors.

| ID | EARS statement |
| ----- | ------------------------- |
| R-JS-1.1 | WHEN a JSON file is selected for import, THE SYSTEM SHALL decode it as UTF-8, strip an optional leading byte order mark before parsing, and parse it locally without transmitting it. |
| R-JS-1.2 | IF the text is not well-formed JSON, THE SYSTEM SHALL reject the whole document as a single failure, report no per-record diagnostics, and preserve the existing vault. |
| R-JS-1.3 | IF the parsed document is not a top-level array, THE SYSTEM SHALL reject it and preserve the existing vault. |
| R-JS-1.4 | IF any record carries more than 100 own keys, THE SYSTEM SHALL reject the whole document, matching the whole-file rejection CSV applies to a column count over 100, and SHALL NOT report it as a per-record diagnostic. |
| R-JS-1.5 | WHERE `R-2.7` bounds an import by file size, data rows, resulting account count and serialized envelope size, THE SYSTEM SHALL apply those same ceilings to a JSON import, reading "data rows" as elements of the top-level array. |
| R-JS-1.6 | WHEN a JSON document is rejected, THE SYSTEM SHALL report a safe message naming the cause, drawn from the audited safe-message set, without echoing document contents, field values or passwords. |

## Unit 2: JSON record validation

**Why:** One bad record must not block a usable file, and a record must be
judged valid or invalid by the same rules CSV already applies, so the two
formats cannot drift into different definitions of a valid account.

| ID | EARS statement |
| ----- | ------------------------- |
| R-JS-2.1 | THE SYSTEM SHALL require each element of the top-level array to be a JSON object, and SHALL mark any element that is not an object invalid with code `RECORD_NOT_OBJECT`. |
| R-JS-2.2 | THE SYSTEM SHALL read `account_id`, `username` and `password` as a record's reserved keys, and SHALL mark a record invalid with code `REQUIRED_FIELD_NOT_STRING` IF any of the three is absent or is not a JSON string. |
| R-JS-2.3 | WHEN building the duplicate-identifier frequency map, THE SYSTEM SHALL count only non-empty trimmed string `account_id` values, so that records with an absent, non-string or empty identifier report their own cause rather than `DUPLICATE_ACCOUNT_ID`. |
| R-JS-2.4 | THE SYSTEM SHALL evaluate record diagnostics in the order `DUPLICATE_ACCOUNT_ID`, `RECORD_NOT_OBJECT`, `REQUIRED_FIELD_NOT_STRING`, `EMPTY_ACCOUNT_ID`, `EMPTY_USERNAME`, `EMPTY_PASSWORD`, `METADATA_VALUE_NOT_SCALAR`, and SHALL report at most one code per record. |
| R-JS-2.5 | WHEN a record is invalid, THE SYSTEM SHALL report its position as the 1-based index of the element in the top-level array, labelled as a record, and SHALL NOT report the record's contents. |

## Unit 3: Metadata values

**Why:** The encrypted vault accepts only flat string metadata, and JSON can
express values CSV cannot. Coercion must be defined explicitly so no value is
silently reshaped and no ordinary QA fixture is rejected for using a number.

| ID | EARS statement |
| ----- | ------------------------- |
| R-JS-3.1 | THE SYSTEM SHALL map every key of a record other than `account_id`, `username` and `password` into that account's metadata. |
| R-JS-3.2 | WHERE a metadata value is a JSON string, THE SYSTEM SHALL store it unchanged. |
| R-JS-3.3 | WHERE a metadata value is a JSON number or boolean, THE SYSTEM SHALL store the result of `String(value)`. |
| R-JS-3.4 | THE SYSTEM SHALL NOT guarantee that a numeric metadata value preserves its source spelling, because integers beyond 2^53, exponent-form numbers and negative zero do not survive `String(value)` unchanged, and SHALL document that a value whose exact spelling matters is written as a JSON string. |
| R-JS-3.5 | WHERE a metadata value is JSON null, THE SYSTEM SHALL store the empty string. |
| R-JS-3.6 | IF a metadata value is an array or an object, THE SYSTEM SHALL mark the record invalid with code `METADATA_VALUE_NOT_SCALAR` and SHALL NOT flatten, stringify or otherwise reshape the value. |
| R-JS-3.7 | THE SYSTEM SHALL store every metadata value as a string and SHALL render metadata only as text. |
| R-JS-3.8 | THE SYSTEM SHALL construct the metadata object by own-property assignment that cannot invoke a prototype setter, so that a record key named `__proto__` becomes an ordinary metadata entry. |

## Unit 4: Import format selection

**Why:** The background worker holds the decrypted vault and must not infer the
type of a file it was handed. Declaring the format at the call site keeps a
mislabelled file a reportable error rather than a silent recovery.

| ID | EARS statement |
| ----- | ------------------------- |
| R-JS-4.1 | THE SYSTEM SHALL accept `csv` and `json` as account formats and SHALL carry the format explicitly on every import preview request. |
| R-JS-4.2 | IF an import preview request omits the format or names an unsupported one, THE SYSTEM SHALL reject the request and preserve the existing vault. |
| R-JS-4.3 | IF an export request omits the format or names an unsupported one, THE SYSTEM SHALL refuse it. |
| R-JS-4.4 | THE SYSTEM SHALL NOT infer the import format from the contents of the file. |
| R-JS-4.5 | WHEN the user chooses a file in Settings, THE SYSTEM SHALL derive the format from the file's extension, accepting `.csv` and `.json`. |
| R-JS-4.6 | IF the chosen file's extension is neither `.csv` nor `.json`, THE SYSTEM SHALL refuse it in Settings, name the accepted extensions, and send no import preview request. |
| R-JS-4.7 | THE SYSTEM SHALL state the validated format in the import review step alongside the file name. |

## Unit 5: Dual-format export

**Why:** A group has to leave the extension in whichever shape the next tool
expects, and the user picks that shape at the moment of export rather than
configuring it beforehand.

| ID | EARS statement |
| ----- | ------------------------- |
| R-JS-5.1 | THE SYSTEM SHALL offer an explicit CSV export and an explicit JSON export of the selected group in Settings. |
| R-JS-5.2 | WHERE the 2026-10-05 selected-group export amendment governs filter independence, group isolation, excluded vault contents, Settings-only access, transient handling of exported text and filename derivation, THE SYSTEM SHALL apply it to every export format. |
| R-JS-5.3 | WHEN JSON export is requested, THE SYSTEM SHALL produce a top-level array holding one object per account in stored order, each carrying `account_id`, `username` and `password` followed by that account's own metadata keys sorted alphabetically. |
| R-JS-5.4 | WHEN JSON export is requested, THE SYSTEM SHALL omit metadata keys an account does not have rather than emitting empty values for them. |
| R-JS-5.5 | THE SYSTEM SHALL serialize JSON export as UTF-8 with two-space indentation and a trailing newline, and SHALL NOT emit a byte order mark. |
| R-JS-5.6 | THE SYSTEM SHALL give the download filename the extension matching the chosen format. |
| R-JS-5.7 | WHEN CSV export is requested, THE SYSTEM SHALL produce byte-identical output to the output it produced before this change. |

## Unit 6: Round-trip fidelity

**Why:** An export that cannot be imported back is a dead end, and the
equivalence between the two formats is the claim most likely to be assumed
rather than tested.

| ID | EARS statement |
| ----- | ------------------------- |
| R-JS-6.1 | WHEN a group exported as JSON is imported into an empty group, THE SYSTEM SHALL reproduce every account with byte-identical passwords, identical account identifiers and usernames, and the same metadata keys and values. |
| R-JS-6.2 | WHEN a CSV document and a JSON document describe the same accounts, THE SYSTEM SHALL produce the same accounts, the same counts and the same diagnostic codes, except that CSV pads a metadata key absent from a record with the empty string, and except for numeric metadata subject to `R-JS-3.4`. |
| R-JS-6.3 | THE SYSTEM SHALL preserve metadata values containing commas, double quotes, newlines and non-ASCII characters across an export and re-import in either format. |

## Unit 7: Command pinning integrity

**Why:** The export command returns plaintext synthetic passwords, and the
check that keeps it off the popup surface currently compares a string literal
that no compiler verifies. Adding a format parameter to that command without
first making the check typed would convert a silent mismatch into a password
disclosure.

| ID | EARS statement |
| ----- | ------------------------- |
| R-JS-7.1 | THE SYSTEM SHALL restrict each page-pinned command to its single permitted extension page through a declaration keyed by the command type, so that a command type absent from the command union fails to compile. |
| R-JS-7.2 | IF a page-pinned command arrives from any page other than its permitted one, THE SYSTEM SHALL refuse it and return that pin's own safe message. |
| R-JS-7.3 | THE SYSTEM SHALL verify refusal of a page-pinned command by asserting the returned message, not only that the request failed. |
| R-JS-7.4 | THE SYSTEM SHALL keep export pinned to the Settings page and fill pinned to the popup page across the introduction of the format parameter. |
