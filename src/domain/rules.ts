import type {
  Route,
  CatalogRule,
  ProfileInput,
  LoginProfile,
  DetectedInput,
  FieldMatch,
  TitleRule,
} from '../shared/types';
const invalid = () => new Error('Enter a valid authorized http:// or https:// URL.');
/** Loopback hosts may use plain http so a local development server can be authorized. */
export function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1';
}
/**
 * Per the user's 2026-10-06 decision, http is accepted on any host, not only
 * loopback. Plain http carries credentials in clear text; this is a QA tool for
 * synthetic accounts and the origin is still matched exactly.
 */
export function isAuthorizedScheme(u: URL): boolean {
  return u.protocol === 'https:' || u.protocol === 'http:';
}
/** Content pages reach the worker over https, or over http while on a loopback host. */
export function isAuthorizedPageUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return isAuthorizedScheme(new URL(value));
  } catch {
    return false;
  }
}
function url(value: string, allowStar = false, observed = false): URL {
  if (typeof value !== 'string' || !value.trim() || /[\\\u0000-\u0020]/u.test(value.trim()))
    throw invalid();
  let u: URL;
  try {
    u = new URL(value.trim());
  } catch {
    throw invalid();
  }
  if (
    !isAuthorizedScheme(u) ||
    u.username ||
    u.password ||
    !u.hostname ||
    u.host.includes('*') ||
    u.hash.includes('*') ||
    (!observed && u.search.includes('*')) ||
    (!allowStar && u.pathname.includes('*'))
  )
    throw invalid();
  return u;
}
export function parseRoute(value: string): Route {
  const u = url(value);
  return { origin: u.origin, pathname: u.pathname, hash: u.hash };
}
export function formatRoute(r: Route): string {
  return r.origin + r.pathname + r.hash;
}
export function parseRule(value: string): CatalogRule {
  const u = url(value, true);
  const rawPath = value.trim().match(/^https?:\/\/[^/]*(\/[^?#]*)/iu)?.[1] ?? '';
  if (/[()[\]{}|^$]/u.test(rawPath)) throw invalid();
  const stars = u.pathname.split('*').length - 1;
  if (stars > 1 || (stars === 1 && !u.pathname.endsWith('*')) || /[{}|^$]/u.test(u.pathname))
    throw invalid();
  return {
    origin: u.origin,
    pathname: stars ? u.pathname.slice(0, -1) : u.pathname,
    hash: u.hash,
    pathMatch: stars ? 'prefix' : 'exact',
  };
}
export function formatRule(r: CatalogRule): string {
  return r.origin + r.pathname + (r.pathMatch === 'prefix' ? '*' : '') + r.hash;
}
export function matchesRoute(r: Route, value: string): boolean {
  try {
    const u = url(value, false, true);
    return r.origin === u.origin && r.pathname === u.pathname && r.hash === u.hash;
  } catch {
    return false;
  }
}
/** Domain authorization ignores routes but keeps scheme, host and port exact. */
export function matchesOrigin(r: Pick<Route, 'origin'>, value: string): boolean {
  try {
    return r.origin === url(value, false, true).origin;
  } catch {
    return false;
  }
}
export function matchesRule(r: CatalogRule, value: string): boolean {
  return matchesOrigin(r, value);
}
export function parseDomainRule(value: string): CatalogRule {
  const parsed = parseRule(value);
  return { origin: parsed.origin, pathname: '/', hash: '', pathMatch: 'prefix' };
}
/**
 * One group may authorize the same application on several environments.
 * Accepts a comma or newline separated list and rejects duplicate origins.
 */
export function parseDomainRules(value: string): CatalogRule[] {
  const parts = value
    .split(/[\s,]+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) throw invalid();
  if (parts.length > 20) throw new Error('A CSV group accepts at most 20 authorized domains.');
  const rules = parts.map(parseDomainRule);
  const origins = new Set(rules.map((r) => r.origin));
  if (origins.size !== rules.length) throw new Error('Remove the duplicate authorized domain.');
  return rules;
}
export function matchesAnyRule(rules: CatalogRule[], value: string): boolean {
  return rules.some((rule) => matchesRule(rule, value));
}
export function matchesAnyOrigin(routes: Pick<Route, 'origin'>[], value: string): boolean {
  return routes.some((route) => matchesOrigin(route, value));
}
/** Normalize application titles for stable, locale-independent profile matching. */
export function normalizeApplicationTitle(title: string): string {
  return typeof title === 'string' ? title.normalize('NFKC').trim().toLowerCase() : '';
}
/**
 * Compare a configured application title rule with an observed document title.
 * Matching is literal; empty values and unsupported modes never match.
 */
export function matchesTitleRule(
  rule: { mode: 'contains' | 'equals'; value: string } | null | undefined,
  title: string,
): boolean {
  if (
    !rule ||
    (rule.mode !== 'contains' && rule.mode !== 'equals') ||
    typeof rule.value !== 'string'
  )
    return false;
  const configured = normalizeApplicationTitle(rule.value);
  const observed = normalizeApplicationTitle(title);
  if (!configured || !observed) return false;
  return rule.mode === 'equals' ? observed === configured : observed.includes(configured);
}
export function validateProfile(
  input: ProfileInput,
  rules: CatalogRule[],
  ruleRevision: number,
  previous?: LoginProfile | null,
): LoginProfile {
  // One profile covers every authorized environment with the same selectors.
  const logins = parseDomainRules(input.loginUrl).map((r) => ({
    origin: r.origin,
    pathname: '/',
    hash: '',
  }));
  // Compare success against the login URL as typed, not the normalized origin,
  // so "success must differ from login" still catches an identical path.
  const login = parseRoute(input.loginUrl.split(/[\s,]+/u).filter(Boolean)[0] ?? input.loginUrl);
  if (!logins.every((l) => matchesAnyRule(rules, l.origin)))
    throw new Error('Login domain must match the imported catalog domain.');
  const configuredTitleRules = input.titleRules === undefined ? [] : input.titleRules;
  if (!Array.isArray(configuredTitleRules))
    throw new Error('Enter valid application title rules.');
  const titleRuleKeys = new Set<string>();
  const titleRules: TitleRule[] = configuredTitleRules.map((candidate) => {
    if (
      !candidate ||
      typeof candidate.origin !== 'string' ||
      !logins.some((allowed) => allowed.origin === candidate.origin)
    )
      throw new Error('Application title rule origin must match a login origin.');
    if (candidate.mode !== 'contains' && candidate.mode !== 'equals')
      throw new Error('Choose a supported application title matching mode.');
    if (typeof candidate.value !== 'string' || !normalizeApplicationTitle(candidate.value))
      throw new Error('Enter a non-empty application title.');
    const value = candidate.value.trim();
    const key = `${candidate.origin}\u0000${normalizeApplicationTitle(value)}`;
    if (titleRuleKeys.has(key))
      throw new Error('Remove duplicate application title rules for the same origin.');
    titleRuleKeys.add(key);
    return { origin: candidate.origin, mode: candidate.mode, value };
  });
  if (!['none', 'url', 'element'].includes(input.successKind))
    throw new Error('Choose a supported success condition.');
  const tracking = input.successKind !== 'none';
  const success = tracking ? parseRoute(input.successUrl) : undefined;
  if (success && login.origin !== success.origin)
    throw new Error('Login and success URLs must share one origin.');
  if (input.successKind === 'url' && matchesRoute(login, input.successUrl))
    throw new Error('Success URL must differ from the login URL.');
  const selector = (s: unknown) => {
    if (typeof s !== 'string' || !s.trim() || s.length > 2048 || /[\u0000-\u001f]/u.test(s))
      throw new Error('Enter a valid field selector.');
    return s.trim();
  };
  const usernameSelector = selector(input.usernameSelector),
    passwordSelector = selector(input.passwordSelector);
  const modes = ['css', 'id', 'name', 'autocomplete', 'placeholder', 'label', 'aria-label'];
  const usernameMatch = input.usernameMatch ?? 'css';
  const passwordMatch = input.passwordMatch ?? 'css';
  if (!modes.includes(usernameMatch) || !modes.includes(passwordMatch))
    throw new Error('Choose a supported field matching method.');
  if (usernameMatch === passwordMatch && usernameSelector === passwordSelector)
    throw new Error('Choose distinct username and password fields.');
  if (
    typeof input.name !== 'string' ||
    !input.name.trim() ||
    input.name.length > 200 ||
    !Number.isSafeInteger(ruleRevision) ||
    ruleRevision < 1
  )
    throw new Error('Enter a profile name and import a catalog first.');
  return {
    id: previous?.id ?? crypto.randomUUID(),
    revision: (previous?.revision ?? 0) + 1,
    approvedCatalogRuleRevision: ruleRevision,
    name: input.name.trim(),
    logins,
    titleRules,
    usernameSelector,
    passwordSelector,
    usernameMatch,
    passwordMatch,
    ...(input.successKind === 'url'
      ? { success: { kind: 'url' as const, route: success! } }
      : input.successKind === 'element'
        ? {
            success: {
              kind: 'element' as const,
              route: success!,
              selector: selector(input.successSelector),
            },
          }
        : {}),
  };
}

/**
 * Picks the most stable identifying attribute for a detected input, preferring
 * attributes that survive copy edits and localization over visible text.
 */
export function suggestMatch(input: DetectedInput): { match: FieldMatch; value: string } | null {
  const candidates: [FieldMatch, string][] = [
    ['id', input.id],
    ['name', input.name],
    // "on"/"off" identify nothing; every field on a page can carry them.
    ['autocomplete', /^(on|off)$/iu.test(input.autocomplete.trim()) ? '' : input.autocomplete],
    ['aria-label', input.ariaLabel],
    ['label', input.label],
    ['placeholder', input.placeholder],
  ];
  for (const [match, value] of candidates) {
    const trimmed = value.trim();
    if (trimmed) return { match, value: trimmed };
  }
  return null;
}
