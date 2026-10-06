import { matchesOrigin } from '../domain/rules';
import type { FieldMatch, FillResult, LoginProfile, Route } from '../shared/types';

export function routeMatches(route: Route, href: string): boolean {
  try {
    const url = new URL(href);
    return (
      url.origin === route.origin && url.pathname === route.pathname && url.hash === route.hash
    );
  } catch {
    return false;
  }
}
export function visible(element: Element, doc: Document): boolean {
  if (!element.isConnected || element.getClientRects().length === 0) return false;
  for (let node: Element | null = element; node; node = node.parentElement) {
    const style = doc.defaultView!.getComputedStyle(node);
    if (
      node.hasAttribute('hidden') ||
      node.hasAttribute('inert') ||
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse' ||
      style.opacity === '0'
    )
      return false;
  }
  return true;
}
export function successVisible(profile: LoginProfile, doc: Document): boolean {
  const success = profile.success;
  // No configured condition means success is never observed, so a fill is never
  // attributed. Autofill itself does not depend on this.
  if (!success || !routeMatches(success.route, doc.location.href)) return false;
  if (success.kind === 'url') return true;
  try {
    return [...doc.querySelectorAll(success.selector)].some((node) => visible(node, doc));
  } catch {
    return false;
  }
}
function candidates(doc: Document, mode: FieldMatch, value: string, password: boolean): Element[] {
  const normalize = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  return [...doc.querySelectorAll('input')].filter((input) => {
    if (
      !(password ? input.type === 'password' : ['text', 'email'].includes(input.type)) ||
      input.matches(':disabled') ||
      input.readOnly ||
      !visible(input, doc)
    )
      return false;
    switch (mode) {
      case 'css':
        // Scoped like every other mode: hidden, disabled or unsupported inputs
        // must not count toward the exactly-one requirement in R-5.2.
        return input.matches(value);
      case 'id':
        return input.id === value;
      case 'name':
        return input.name === value;
      case 'autocomplete':
        return (input.getAttribute('autocomplete') ?? '')
          .toLowerCase()
          .split(/\s+/)
          .includes(value.toLowerCase());
      case 'placeholder':
        return normalize(input.placeholder) === normalize(value);
      case 'aria-label':
        return normalize(input.getAttribute('aria-label') ?? '') === normalize(value);
      case 'label': {
        const labels = [...(input.labels ?? [])]
          .filter((label) => visible(label, doc))
          .map((label) => label.textContent ?? '');
        const labelled = (input.getAttribute('aria-labelledby') ?? '')
          .split(/\s+/)
          .map((id) => doc.getElementById(id))
          .filter((node): node is HTMLElement => !!node && visible(node, doc));
        if (labelled.length) labels.push(labelled.map((node) => node.textContent ?? '').join(' '));
        return labels.some((label) => normalize(label) === normalize(value));
      }
      default:
        return false;
    }
  });
}
export function loginFields(
  profile: LoginProfile,
  doc: Document,
): [HTMLInputElement, HTMLInputElement] {
  if (!matchesOrigin(profile.login, doc.location.href))
    throw new Error('The current page is not on the authorized login domain.');
  const username = candidates(doc, profile.usernameMatch ?? 'css', profile.usernameSelector, false),
    password = candidates(doc, profile.passwordMatch ?? 'css', profile.passwordSelector, true);
  const Input = doc.defaultView!.HTMLInputElement;
  if (
    username.length !== 1 ||
    password.length !== 1 ||
    username[0] === password[0] ||
    !(username[0] instanceof Input) ||
    !(password[0] instanceof Input)
  )
    throw new Error('Each selector must match one distinct input.');
  const u = username[0] as HTMLInputElement,
    p = password[0] as HTMLInputElement;
  if (!['text', 'email'].includes(u.type) || p.type !== 'password')
    throw new Error('Choose a text or email username field and a password field.');
  for (const field of [u, p]) {
    if (field.disabled || field.matches(':disabled') || field.readOnly || !visible(field, doc))
      throw new Error('Both login fields must be visible and writable.');
    if (
      field.form?.hasAttribute('action') &&
      new URL(field.form.action, doc.location.href).origin !== profile.login.origin
    )
      throw new Error('The form sends data to a different origin.');
  }
  return [u, p];
}
/** @spec R-5.2 R-5.3 R-6.4 */
export function inspectFields(profile: LoginProfile, doc: Document = document): FillResult {
  try {
    loginFields(profile, doc);
    return { ok: true, baseline: successVisible(profile, doc) };
  } catch {
    return { ok: false, error: 'Check the page URL and unique, visible login field selectors.' };
  }
}
/** @spec R-5.4 R-5.5 R-5.6 R-5.7 */
export function fillFields(
  profile: LoginProfile,
  username: string,
  password: string,
  doc: Document = document,
): FillResult {
  let fields: [HTMLInputElement, HTMLInputElement] | undefined;
  const values = [username, password];
  const written = [false, false];
  const setter = Object.getOwnPropertyDescriptor(
    doc.defaultView!.HTMLInputElement.prototype,
    'value',
  )!.set!;
  try {
    fields = loginFields(profile, doc);
    if (successVisible(profile, doc)) throw new Error('Already successful');
    for (let i = 0; i < 2; i++) {
      const current = loginFields(profile, doc);
      if (current[0] !== fields[0] || current[1] !== fields[1]) throw new Error('Inputs changed');
      setter.call(fields[i], values[i]);
      written[i] = true;
      fields[i].dispatchEvent(new doc.defaultView!.Event('input', { bubbles: true }));
      fields[i].dispatchEvent(new doc.defaultView!.Event('change', { bubbles: true }));
    }
    const current = loginFields(profile, doc);
    if (
      current[0] !== fields[0] ||
      current[1] !== fields[1] ||
      fields.some((field, i) => field.value !== values[i])
    )
      throw new Error('Inputs did not retain values');
    return { ok: true };
  } catch {
    fields?.forEach((field, i) => {
      if (written[i] && field.value === values[i]) {
        setter.call(field, '');
        field.dispatchEvent(new doc.defaultView!.Event('input', { bubbles: true }));
        field.dispatchEvent(new doc.defaultView!.Event('change', { bubbles: true }));
      }
    });
    return {
      ok: false,
      error: 'The page changed or rejected the fill. Review the login fields and try again.',
    };
  }
}
