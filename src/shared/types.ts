export interface Account {
  accountId: string;
  username: string;
  password: string;
  metadata: Record<string, string>;
}
export type AccountSummary = Omit<Account, 'password'> & {
  groupId?: string;
  groupName?: string;
  applicationIdentity?: {
    status: 'matched' | 'choice-required' | 'unavailable';
    title: string | null;
    rule: TitleRule | null;
    matched: boolean;
    selected?: boolean;
  };
};
export interface Route {
  origin: string;
  pathname: string;
  hash: string;
}
export interface CatalogRule extends Route {
  pathMatch: 'exact' | 'prefix';
}
export type FieldMatch =
  'css' | 'id' | 'name' | 'autocomplete' | 'placeholder' | 'label' | 'aria-label';
export interface TitleRule {
  origin: string;
  mode: 'contains' | 'equals';
  value: string;
}
export interface LoginProfile {
  id: string;
  revision: number;
  approvedCatalogRuleRevision: number;
  name: string;
  /** Every authorized origin shares one set of field selectors. */
  logins: Route[];
  /** Optional application identity hints; persisted inside the encrypted vault. */
  titleRules?: TitleRule[];
  usernameSelector: string;
  passwordSelector: string;
  usernameMatch?: FieldMatch;
  passwordMatch?: FieldMatch;
  /** Optional: success tracking only records which account last signed in. */
  success?: { kind: 'url'; route: Route } | { kind: 'element'; route: Route; selector: string };
}
export interface ProfileInput {
  name: string;
  loginUrl: string;
  /** Omitted by legacy callers; no title recognition is configured. */
  titleRules?: TitleRule[];
  usernameSelector: string;
  passwordSelector: string;
  usernameMatch?: FieldMatch;
  passwordMatch?: FieldMatch;
  successKind: 'none' | 'url' | 'element';
  successUrl: string;
  successSelector?: string;
}
export interface ProfileHistory {
  lastSuccessfulAccountId: string | null;
  lastSuccessfulAt: number | null;
  recentAccountIds: string[];
}
export interface VaultPayload {
  schemaVersion: 1;
  revision: number;
  snapshotRevision: number;
  /** Legacy single-domain form. Migrated into catalogRules on read. */
  catalogRule?: CatalogRule | null;
  /** Origins this group's accounts may be filled on, e.g. prod and staging. */
  catalogRules: CatalogRule[];
  /** Optional for backwards compatibility; encrypted with this group's vault. */
  titleRules?: TitleRule[];
  catalogRuleRevision: number;
  accounts: Account[];
  history: Record<string, ProfileHistory>;
}
export interface Envelope {
  version: 1;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}
export type AccountFormat = 'csv' | 'json';
export type ImportDiagnosticCode =
  | 'DUPLICATE_ACCOUNT_ID'
  | 'FIELD_COUNT_MISMATCH'
  | 'RECORD_NOT_OBJECT'
  | 'REQUIRED_FIELD_NOT_STRING'
  | 'EMPTY_ACCOUNT_ID'
  | 'EMPTY_USERNAME'
  | 'EMPTY_PASSWORD'
  | 'METADATA_VALUE_NOT_SCALAR';
export interface ImportDiagnostic {
  /**
   * Position in the source document, counted in that format's own unit: a CSV
   * row is a physical line with the header at 1, while a JSON record is a
   * 1-based index into the top-level array. The two are disjoint, so the unit
   * travels with the position instead of being inferred by the reader.
   */
  at: number;
  unit: 'row' | 'record';
  code: ImportDiagnosticCode;
}
export interface ImportResult {
  accounts: Account[];
  found: number;
  valid: number;
  invalid: number;
  diagnostics: ImportDiagnostic[];
}
export type ImportMode = 'merge' | 'replace';
export interface ImportCounts {
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
}
export interface ImportPreview extends ImportCounts {
  token: string;
  found: number;
  valid: number;
  invalid: number;
  diagnostics: ImportDiagnostic[];
  rule: string;
  mode: ImportMode;
  format: AccountFormat;
}
export interface Attempt {
  token: string;
  tabId: number;
  documentId: string;
  profileId: string;
  profileRevision: number;
  catalogRevision: number;
  accountId: string;
  createdAt: number;
  expiresAt: number;
  acknowledged?: boolean;
}
// @debt A second import format landed; the group concept is no longer
// CSV-specific. `CsvGroup` and the "CSV group name" label in Settings outlive
// CSV-only scope. Ceiling: rename in one deliberate pass across types.ts and
// options/index.ts, traceable to its own reason — not laundered through a
// feature change.
export interface CsvGroup {
  id: string;
  name: string;
}
export interface AppState {
  groups?: CsvGroup[];
  groupId?: string;
  groupName?: string;
  applicationIdentity?: {
    status: 'matched' | 'choice-required' | 'unavailable';
    title: string | null;
    groupId: string | null;
    groupName: string | null;
    rule: TitleRule | null;
    matched: boolean;
    selected: boolean;
  };
  initialized: boolean;
  migrationRequired: boolean;
  profile: LoginProfile | null;
  rules: string[];
  total: number;
  matches: number;
  page: number;
  accounts: AccountSummary[];
  recent: AccountSummary[];
  lastSuccessful: AccountSummary | null;
  lastSuccessfulAt: number | null;
  authorized: boolean;
  siteLabel: string;
  storageBytes: number;
  undoAvailable: boolean;
  undoExpiresAt: number | null;
  version: string;
}
export type Command =
  | { type: 'CREATE_GROUP'; name: string }
  | { type: 'RENAME_GROUP'; name: string }
  | { type: 'STATE'; query?: string; page?: number; tabId?: number }
  | { type: 'CHOOSE_GROUP'; groupId: string; tabId: number }
  | { type: 'MIGRATE'; password: string }
  | { type: 'RESET' | 'UNDO' | 'PURGE' }
  | { type: 'EXPORT_ACCOUNTS'; format: AccountFormat }
  | {
      type: 'PREVIEW_IMPORT';
      bytes: number[];
      rule: string;
      mode: ImportMode;
      format: AccountFormat;
    }
  | { type: 'COMMIT_IMPORT'; token: string }
  | { type: 'SAVE_PROFILE'; profile: ProfileInput }
  | {
      type: 'DELETE' | 'FILL';
      accountId: string;
      tabId?: number;
      groupId?: string;
      fromSearch?: boolean;
      /** Background-only snapshot passed to the owning service before delivery. */
      expectedPage?: { documentId: string; url: string; title: string | null };
    }
  | { type: 'COPY_PASSWORD'; accountId: string }
  | { type: 'DETECT_FIELDS'; tabId?: number }
  | { type: 'DETECT_TABS' }
  | { type: 'SET_CATALOG_RULE'; rule: string };
export type Reply<T = unknown> = { ok: true; data: T } | { ok: false; error: string };
export type ContentRequest =
  { type: 'CONTENT_CONTEXT' } | { type: 'SUCCESS_OBSERVED' | 'CANCEL_ATTEMPT'; token: string };
export interface ContentContext {
  profile: LoginProfile | null;
  attempt: Attempt | null;
}
export type ContentInstruction =
  | { type: 'INSPECT'; profile: LoginProfile }
  | {
      type: 'FILL_FIELDS';
      profile: LoginProfile;
      username: string;
      password: string;
      attempt?: Attempt;
    }
  | { type: 'TRACK'; attempt: Attempt; profile: LoginProfile };
/** A recently used tab on an authorized domain, offered as a detection source. */
export interface DetectTab {
  id: number;
  title: string;
  url: string;
}
/** Identifying attributes only. Detection never reports input values. */
export interface DetectedInput {
  password: boolean;
  id: string;
  name: string;
  autocomplete: string;
  placeholder: string;
  ariaLabel: string;
  label: string;
}
/**
 * Candidates plus the frames that could not be read. A login form inside an
 * embedded frame is invisible to both detection and filling, so the UI needs
 * to name that cause instead of reporting an empty page.
 */
export interface DetectResult {
  inputs: DetectedInput[];
  frames: string[];
}
export interface FillResult {
  ok: boolean;
  error?: string;
  baseline?: boolean;
}
