export interface Account {
  accountId: string;
  username: string;
  password: string;
  metadata: Record<string, string>;
}
export type AccountSummary = Omit<Account, 'password'>;
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
export interface LoginProfile {
  id: string;
  revision: number;
  approvedCatalogRuleRevision: number;
  name: string;
  login: Route;
  usernameSelector: string;
  passwordSelector: string;
  usernameMatch?: FieldMatch;
  passwordMatch?: FieldMatch;
  success: { kind: 'url'; route: Route } | { kind: 'element'; route: Route; selector: string };
}
export interface ProfileInput {
  name: string;
  loginUrl: string;
  usernameSelector: string;
  passwordSelector: string;
  usernameMatch?: FieldMatch;
  passwordMatch?: FieldMatch;
  successKind: 'url' | 'element';
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
  catalogRule: CatalogRule | null;
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
export interface RowDiagnostic {
  row: number;
  code: string;
}
export interface CsvResult {
  accounts: Account[];
  found: number;
  valid: number;
  invalid: number;
  diagnostics: RowDiagnostic[];
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
  diagnostics: RowDiagnostic[];
  rule: string;
  mode: ImportMode;
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
export interface CsvGroup {
  id: string;
  name: string;
}
export interface AppState {
  groups?: CsvGroup[];
  groupId?: string;
  groupName?: string;
  initialized: boolean;
  migrationRequired: boolean;
  profile: LoginProfile | null;
  rule: string | null;
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
  | { type: 'MIGRATE'; password: string }
  | { type: 'RESET' | 'UNDO' | 'PURGE' | 'EXPORT_CSV' }
  | { type: 'PREVIEW_IMPORT'; bytes: number[]; rule: string; mode: ImportMode }
  | { type: 'COMMIT_IMPORT'; token: string }
  | { type: 'SAVE_PROFILE'; profile: ProfileInput }
  | { type: 'DELETE' | 'FILL'; accountId: string; tabId?: number };
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
export interface FillResult {
  ok: boolean;
  error?: string;
  baseline?: boolean;
}
