import type {
  VaultPayload,
  CsvResult,
  CatalogRule,
  ImportMode,
  ImportCounts,
  Account,
  ProfileHistory,
} from '../shared/types';
export function emptyVault(): VaultPayload {
  return {
    schemaVersion: 1,
    revision: 0,
    snapshotRevision: 0,
    catalogRules: [],
    catalogRuleRevision: 0,
    accounts: [],
    history: {},
  };
}
function same(a: Account, b: Account): boolean {
  return (
    a.username === b.username &&
    a.password === b.password &&
    Object.keys(a.metadata).length === Object.keys(b.metadata).length &&
    Object.entries(a.metadata).every(
      ([k, v]) => Object.hasOwn(b.metadata, k) && b.metadata[k] === v,
    )
  );
}
// @spec R-2.8..R-2.20: create an isolated prospective snapshot; the worker commits it atomically.
export function planImport(
  current: VaultPayload,
  parsed: CsvResult,
  rules: CatalogRule[],
  mode: ImportMode,
): { payload: VaultPayload; counts: ImportCounts } {
  if (!parsed.accounts.length) throw new Error('Import needs at least one valid account.');
  if (mode !== 'merge' && mode !== 'replace') throw new Error('Choose a supported import mode.');
  const origins = (list: CatalogRule[]) =>
    list
      .map((r) => r.origin)
      .sort()
      .join(' ');
  const changed = origins(current.catalogRules) !== origins(rules);
  if (mode === 'merge' && current.accounts.length && changed)
    throw new Error('Use Wipe & Replace to change the catalog URL rule.');
  const old = new Map(current.accounts.map((a) => [a.accountId, a])),
    incoming = new Map(parsed.accounts.map((a) => [a.accountId, a]));
  const counts: ImportCounts = {
    added: 0,
    updated: 0,
    unchanged: 0,
    removed:
      mode === 'replace' ? current.accounts.filter((a) => !incoming.has(a.accountId)).length : 0,
  };
  const credentialsChanged = new Set<string>();
  for (const a of parsed.accounts) {
    const before = old.get(a.accountId);
    if (!before) counts.added++;
    else if (same(before, a)) counts.unchanged++;
    else {
      counts.updated++;
      if (before.username !== a.username || before.password !== a.password)
        credentialsChanged.add(a.accountId);
    }
  }
  const next = mode === 'merge' ? new Map(old) : new Map<string, Account>();
  for (const a of parsed.accounts) next.set(a.accountId, a);
  if (next.size > 10000) throw new Error('The resulting catalog exceeds 10,000 accounts.');
  const history: Record<string, ProfileHistory> = Object.fromEntries(
    changed
      ? []
      : Object.entries(current.history).map(([id, h]) => {
          const successful =
            h.lastSuccessfulAccountId !== null &&
            next.has(h.lastSuccessfulAccountId) &&
            !credentialsChanged.has(h.lastSuccessfulAccountId);
          return [
            id,
            {
              lastSuccessfulAccountId: successful ? h.lastSuccessfulAccountId : null,
              lastSuccessfulAt: successful ? h.lastSuccessfulAt : null,
              recentAccountIds: h.recentAccountIds.filter((a) => next.has(a)),
            },
          ];
        }),
  );
  return {
    counts,
    payload: structuredClone({
      ...current,
      revision: current.revision + 1,
      snapshotRevision: current.snapshotRevision + 1,
      catalogRules: rules,
      catalogRuleRevision: current.catalogRuleRevision + (changed ? 1 : 0),
      accounts: [...next.values()],
      history,
    }),
  };
}
