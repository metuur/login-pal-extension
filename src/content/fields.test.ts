import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { inspectFields, fillFields } from './fields';
import type { LoginProfile, FieldMatch } from '../shared/types';
const profile: LoginProfile = {
  id: 'qa',
  revision: 1,
  approvedCatalogRuleRevision: 1,
  name: 'QA',
  logins: [{ origin: 'https://qa.example.test', pathname: '/login', hash: '' }],
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
  it('fills login fields a component places in an open shadow root', () => {
    const dom = fixture('<div id="host"></div>');
    const doc = dom.window.document;
    const root = doc.querySelector('#host')!.attachShadow({ mode: 'open' });
    root.innerHTML = '<input id="user"><input id="pass" type="password">';
    expect(inspectFields(profile, doc).ok).toBe(true);
    expect(fillFields(profile, 'synthetic-user', 'synthetic-password', doc).ok).toBe(true);
    expect(root.querySelector<HTMLInputElement>('#user')!.value).toBe('synthetic-user');
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
  it('ignores hidden and unsupported inputs when a CSS selector is ambiguous', () => {
    const emailInput =
      '<input class="by-input-text" type="text" placeholder="Email" autocomplete="off" name="email" data-test-input="true">';
    const config = {
      ...profile,
      usernameSelector:
        'input[autocomplete~="username"], input[type="email"], input[name="username" i], input[name="email" i]',
      passwordSelector: 'input[type="password"]',
    };
    for (const html of [
      `<form>${emailInput}<input type="password" name="password"></form>`,
      `<input type="email" name="newsletter" hidden><form>${emailInput}<input type="password" name="password"></form>`,
      `<form>${emailInput}<input type="password" name="password"></form><input type="password" name="confirm" hidden>`,
      `<input type="email" name="other" disabled><form>${emailInput}<input type="password" name="password"></form>`,
    ]) {
      const dom = fixture(html);
      expect(inspectFields(config, dom.window.document).ok).toBe(true);
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
  it('allows other paths on the domain but rejects other origins', () => {
    const dom = fixture();
    dom.reconfigure({ url: 'https://qa.example.test/unrelated?tenant=2#signin' });
    expect(inspectFields(profile, dom.window.document).ok).toBe(true);
    for (const url of [
      'https://qa.example.test.evil/login',
      'https://sub.qa.example.test/login',
      'http://qa.example.test/login',
      'https://qa.example.test:444/login',
    ]) {
      dom.reconfigure({ url });
      expect(inspectFields(profile, dom.window.document).ok).toBe(false);
    }
    dom.window.close();
  });
  it('recognizes an already visible configured success marker', () => {
    const dom = fixture(
      '<input id="user"><input id="pass" type="password"><div id="success">Ready</div>',
    );
    const p = {
      ...profile,
      success: { kind: 'element' as const, route: profile.logins[0], selector: '#success' },
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
      success: { kind: 'element' as const, route: profile.logins[0], selector: '#success' },
    };
    expect(fillFields(config, u.value, p.value, dom.window.document).ok).toBe(false);
    expect(u.value.length > 0 && p.value.length > 0).toBe(true);
    dom.window.close();
  });
});
