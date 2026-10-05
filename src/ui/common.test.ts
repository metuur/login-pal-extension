import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  accountRow,
  featuredHeading,
  metadata,
  request,
  searchBox,
  slashSearch,
  migrationForm,
} from './common';
import type { AppState } from '../shared/types';

beforeEach(() => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  vi.stubGlobal('document', dom.window.document);
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
  vi.stubGlobal('KeyboardEvent', dom.window.KeyboardEvent);
  vi.stubGlobal('Event', dom.window.Event);
  vi.stubGlobal('chrome', {
    runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: true, data: undefined }) },
  });
});
describe('password-free accessible views', () => {
  it('uses actual optional featured chips and keeps long hostile labels inert', () => {
    const heading = featuredHeading({
      accountId: 'QA-1',
      username: 'qa@example.test',
      metadata: {
        customer_name: 'A very long customer organization name',
        account_type: '<b>Premium</b>',
        environment: 'QA — extended environment label',
      },
    });
    expect(heading.querySelector('b')).toBeNull();
    expect(heading.querySelector('.featured-badge')?.textContent).toBe('<b>Premium</b>');
    expect(heading.querySelector('.environment-badge')?.textContent).toContain(
      'extended environment',
    );
    expect(
      featuredHeading({
        accountId: 'QA-2',
        username: 'demo@example.test',
        metadata: {},
      }).querySelectorAll('.badge'),
    ).toHaveLength(0);
  });
  it('renders hostile account metadata as inert, inspectable text', () => {
    const account = {
      accountId: 'QA-001',
      username: 'demo@example.test',
      metadata: { customer_name: '<img src=x onerror=alert(1)>', role: '<script>bad()</script>' },
    };
    const row = accountRow(account, () => {});
    document.body.append(row, metadata(account));
    expect(document.querySelector('img,script')).toBeNull();
    expect(document.body.textContent).toContain(account.metadata.customer_name);
    expect(row.querySelector('button')?.textContent).toBe('Fill it…');
    expect(row.querySelector('details')?.textContent).toContain('demo@example.test');
  });
  it('uses a distinct named delete action', () => {
    const row = accountRow(
      { accountId: 'QA-1', username: 'qa@example.test', metadata: {} },
      () => {},
      true,
      'https://qa.example.test',
    );
    expect(row.querySelector('button')?.getAttribute('aria-label')).toBe('Delete QA-1');
    expect(row.textContent).toContain('https://qa.example.test');
  });
  it('only focuses search for an unmodified slash outside editable fields while unlocked', () => {
    let unlocked = true;
    const search = searchBox(() => {});
    const other = document.createElement('input');
    document.body.append(search.wrap, other);
    slashSearch(search.input, () => unlocked);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    expect(document.activeElement).toBe(search.input);
    other.focus();
    other.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    expect(document.activeElement).toBe(other);
    other.blur();
    unlocked = false;
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    expect(document.activeElement).not.toBe(search.input);
    unlocked = true;
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: '/', ctrlKey: true, bubbles: true }),
    );
    expect(document.activeElement).not.toBe(search.input);
  });
  it('offers only one-time migration for legacy accounts', async () => {
    const form = migrationForm(async () => {});
    document.body.append(form);
    const input = form.querySelector('input')!;
    input.value = 'old synthetic password';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'MIGRATE',
      groupId: 'default',
      password: 'old synthetic password',
    });
    expect(form.querySelectorAll('input')).toHaveLength(1);
    expect(form.textContent).toContain('Future visits open directly');
  });
  it('never invents success on a failed worker acknowledgement', async () => {
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({ ok: false, error: 'Storage unavailable.' }),
      },
    });
    await expect(request({ type: 'PURGE' })).rejects.toThrow('Storage unavailable.');
  });
});
