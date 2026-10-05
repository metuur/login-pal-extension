import type { Route, CatalogRule, ProfileInput, LoginProfile } from '../shared/types';
const invalid = () => new Error('Enter a valid authorized HTTPS URL, or http:// on localhost.');
/** Loopback hosts may use plain http so a local development server can be authorized. */
export function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1';
}
export function isAuthorizedScheme(u: URL): boolean {
  return u.protocol === 'https:' || (u.protocol === 'http:' && isLoopbackHost(u.hostname));
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
export function validateProfile(
  input: ProfileInput,
  rule: CatalogRule,
  ruleRevision: number,
  previous?: LoginProfile | null,
): LoginProfile {
  const login = parseRoute(input.loginUrl),
    success = parseRoute(input.successUrl);
  if (!matchesRule(rule, input.loginUrl))
    throw new Error('Login domain must match the imported catalog domain.');
  if (login.origin !== success.origin)
    throw new Error('Login and success URLs must share one origin.');
  if (input.successKind !== 'url' && input.successKind !== 'element')
    throw new Error('Choose a supported success condition.');
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
    login: { origin: login.origin, pathname: '/', hash: '' },
    usernameSelector,
    passwordSelector,
    usernameMatch,
    passwordMatch,
    success:
      input.successKind === 'url'
        ? { kind: 'url', route: success }
        : { kind: 'element', route: success, selector: selector(input.successSelector) },
  };
}
