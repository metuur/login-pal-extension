import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { inspectFields, fillFields } from './fields';
import type { LoginProfile, FieldMatch } from '../shared/types';
const profile: LoginProfile = {
  id: 'qa',
  revision: 1,
  approvedCatalogRuleRevision: 1,
  name: 'QA',
  login: { origin: 'https://qa.example.test', pathname: '/login', hash: '' },
  usernameSelector: '#user',
  passwordSelector: '#pass',
  success: {
    kind: 'url',
    route: { origin: 'https://qa.example.test', pathname: '/dashboard', hash: '' },
  },
};
function fixture(
  html = '<form><input id="user"><input id="pass" type="password"><button>Login</button></form>',
) {
  const dom = new JSDOM(html, { url: 'https://qa.example.test/login' });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'getClientRects', {
    value() {
      return this.hidden ? [] : [{ width: 100, height: 20 }];
    },
  });
  return dom;
}
describe('validated credential delivery', () => {
  it.each([
    ['id', 'user', 'pass'],
    ['name', 'login:user', 'login:password'],
    ['autocomplete', 'username', 'current-password'],
    ['placeholder', 'EMAIL ADDRESS', 'enter password'],
    ['label', 'Email address', 'Password'],
    ['aria-label', 'Account email', 'Account password'],
  ] as [FieldMatch, string, string][])(
    'fills unambiguous inputs using %s without CSS interpolation',
    (mode, user, pass) => {
      const dom = fixture(
        '<form><label for="user"> Email   address </label><input id="user" name="login:user" autocomplete="section-login username" placeholder="Email address" aria-label="Account email"><label for="pass">Password</label><input id="pass" type="password" name="login:password" autocomplete="current-password" placeholder="Enter password" aria-label="Account password"></form>',
      );
      const config = {
        ...profile,
        usernameMatch: mode,
        passwordMatch: mode,
        usernameSelector: user,
        passwordSelector: pass,
      };
      expect(
        fillFields(config, 'synthetic-user', 'synthetic-password', dom.window.document).ok,
      ).toBe(true);
      dom.window.close();
    },
  );
  it('supports aria-labelledby text and rejects multiple visible matching candidates', () => {
    const dom = fixture(
      '<span id="user-label">Account</span><input id="user" aria-labelledby="user-label"><input id="pass" type="password" autocomplete="current-password">',
    );
    const config = {
      ...profile,
      usernameMatch: 'label' as const,
      usernameSelector: 'account',
      passwordMatch: 'autocomplete' as const,
      passwordSelector: 'current-password',
    };
    expect(inspectFields(config, dom.window.document).ok).toBe(true);
    const second = dom.window.document.createElement('input');
    second.setAttribute('aria-labelledby', 'user-label');
    dom.window.document.body.append(second);
    expect(fillFields(config, 'synthetic-user', 'synthetic-password', dom.window.document).ok).toBe(
      false,
    );
    expect(dom.window.document.querySelector<HTMLInputElement>('#user')!.value).toBe('');
    second.hidden = true;
    expect(inspectFields(config, dom.window.document).ok).toBe(true);
    dom.window.close();
  });
  it('rejects inputs disabled by their containing fieldset', () => {
    const dom = fixture(
      '<form><fieldset disabled><input id="user"><input id="pass" type="password"></fieldset></form>',
    );
    expect(inspectFields(profile, dom.window.document).ok).toBe(false);
    dom.window.close();
  });
  it('rejects missing, ambiguous, hidden and cross-origin fields before writing', () => {
    for (const html of [
      '<input id="user">',
      '<input id="user"><input id="user"><input id="pass" type="password">',
      '<input id="user"><input hidden id="pass" type="password">',
      '<form action="https://other.test"><input id="user"><input id="pass" type="password"></form>',
    ]) {
      const dom = fixture(html);
      expect(inspectFields(profile, dom.window.document).ok).toBe(false);
      dom.window.close();
    }
  });
  it('fills both native inputs without submitting and acknowledges no secrets', () => {
    const dom = fixture();
    let submitted = false;
    dom.window.document.querySelector('form')!.addEventListener('submit', () => (submitted = true));
    const result = fillFields(profile, 'synthetic-user', 'synthetic-value', dom.window.document);
    expect(result).toEqual({ ok: true });
    expect(submitted).toBe(false);
    expect(
      dom.window.document.querySelector<HTMLInputElement>('#user')!.value === 'synthetic-user',
    ).toBe(true);
    expect(
      dom.window.document.querySelector<HTMLInputElement>('#pass')!.value === 'synthetic-value',
    ).toBe(true);
    dom.window.close();
  });
  it('preserves page changes and cleans up a partial fill', () => {
    const dom = fixture();
    const user = dom.window.document.querySelector<HTMLInputElement>('#user')!;
    const pass = dom.window.document.querySelector<HTMLInputElement>('#pass')!;
    pass.addEventListener('input', () => {
      pass.value = 'page-change';
    });
    expect(fillFields(profile, 'synthetic-user', 'synthetic-value', dom.window.document).ok).toBe(
      false,
    );
    expect(user.value.length).toBe(0);
    expect(pass.value === 'page-change').toBe(true);
    dom.window.close();
  });
  it('rejects lookalike and off-route documents', () => {
    const dom = fixture();
    dom.reconfigure({ url: 'https://qa.example.test/unrelated' });
    expect(inspectFields(profile, dom.window.document).ok).toBe(false);
    dom.window.close();
  });
  it('recognizes an already visible configured success marker', () => {
    const dom = fixture(
      '<input id="user"><input id="pass" type="password"><div id="success">Ready</div>',
    );
    const p = {
      ...profile,
      success: { kind: 'element' as const, route: profile.login, selector: '#success' },
    };
    expect(inspectFields(p, dom.window.document).baseline).toBe(true);
    dom.window.close();
  });
  it('does not erase preexisting values when filling is rejected before any write', () => {
    const dom = fixture(
      '<input id="user"><input id="pass" type="password"><div id="success">Ready</div>',
    );
    const u = dom.window.document.querySelector<HTMLInputElement>('#user')!,
      p = dom.window.document.querySelector<HTMLInputElement>('#pass')!;
    u.value = 'synthetic-user';
    p.value = 'synthetic-value';
    const config = {
      ...profile,
      success: { kind: 'element' as const, route: profile.login, selector: '#success' },
    };
    expect(fillFields(config, u.value, p.value, dom.window.document).ok).toBe(false);
    expect(u.value.length > 0 && p.value.length > 0).toBe(true);
    dom.window.close();
  });
});
