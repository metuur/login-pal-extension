import type { Account, AccountSummary, TitleRule } from '../shared/types';
const normalize = (s: string) => s.normalize('NFKC').toLowerCase();
// No process-wide index: releasing worker vault references also releases search material.
// @spec R-4.1..R-4.4
export function searchAccounts(
  accounts: Account[],
  query: string,
  page: number,
): { accounts: AccountSummary[]; total: number; matches: number; page: number } {
  const tokens = normalize(query).trim().split(/\s+/u).filter(Boolean);
  const matched = accounts
    .filter((a) => {
      const fields = [a.accountId, a.username, ...Object.entries(a.metadata).flat()].map(normalize);
      return tokens.every((t) => fields.some((f) => f.includes(t)));
    })
    .sort((a, b) => (a.accountId < b.accountId ? -1 : a.accountId > b.accountId ? 1 : 0));
  const safePage = Math.min(
    Math.max(0, Number.isFinite(page) ? Math.floor(page) : 0),
    Math.max(0, Math.ceil(matched.length / 50) - 1),
  );
  return {
    accounts: matched
      .slice(safePage * 50, safePage * 50 + 50)
      .map((a) => ({ accountId: a.accountId, username: a.username, metadata: { ...a.metadata } })),
    total: accounts.length,
    matches: matched.length,
    page: safePage,
  };
}

export interface GroupSearchRecord {
  account: Account;
  groupId: string;
  groupName: string;
  profileName: string;
  authorizedOrigins: string[];
  titleRules: TitleRule[];
}

/** Search all available groups without ever considering account passwords. */
export function searchAccountsAcrossGroups(
  records: GroupSearchRecord[],
  query: string,
  page: number,
): { accounts: AccountSummary[]; total: number; matches: number; page: number } {
  const tokens = normalize(query).trim().split(/\s+/u).filter(Boolean);
  const matched = records
    .filter((record) => {
      const fields = [
        record.account.accountId,
        record.account.username,
        ...Object.entries(record.account.metadata).flat(),
        record.groupName,
        record.profileName,
        ...record.authorizedOrigins,
        ...record.titleRules.map((rule) => rule.value),
      ].map(normalize);
      return tokens.every((token) => fields.some((field) => field.includes(token)));
    })
    .sort((a, b) =>
      a.groupName < b.groupName
        ? -1
        : a.groupName > b.groupName
          ? 1
          : a.groupId < b.groupId
            ? -1
            : a.groupId > b.groupId
              ? 1
              : a.account.accountId < b.account.accountId
                ? -1
                : a.account.accountId > b.account.accountId
                  ? 1
                  : 0,
    );
  const safePage = Math.min(
    Math.max(0, Number.isFinite(page) ? Math.floor(page) : 0),
    Math.max(0, Math.ceil(matched.length / 50) - 1),
  );
  return {
    accounts: matched
      .slice(safePage * 50, safePage * 50 + 50)
      .map(({ account, groupId, groupName }) => ({
        accountId: account.accountId,
        username: account.username,
        metadata: { ...account.metadata },
        groupId,
        groupName,
      })),
    total: records.length,
    matches: matched.length,
    page: safePage,
  };
}
