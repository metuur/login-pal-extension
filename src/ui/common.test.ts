import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import {
  accountRow,
  featuredHeading,
  installActivityTracking,
  metadata,
  request,
  searchBox,
  slashSearch,
  vaultForm,
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
  it('renews inactivity only for trusted unlocked interactions, without automatic renewal', async () => {
    let unlocked = true;
    const listenerSpy = vi.spyOn(document, 'addEventListener');
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    const cleanup = installActivityTracking(() => unlocked);
    const listener = listenerSpy.mock.calls.find(
      ([name]) => name === 'pointerdown',
    )?.[1] as EventListener;
    listener({ isTrusted: false } as Event);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    listener({ isTrusted: true } as Event);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledExactlyOnceWith({ type: 'TOUCH' });
    now.mockReturnValue(1200);
    listener({ isTrusted: true } as Event);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1600);
    unlocked = false;
    listener({ isTrusted: true } as Event);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(1);
    unlocked = true;
    listener({ isTrusted: true } as Event);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
    cleanup();
    now.mockReturnValue(10000);
    listener({ isTrusted: true } as Event);
    await Promise.resolve();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
    listenerSpy.mockRestore();
    now.mockRestore();
  });
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
  it('requires master password confirmation before sending setup', async () => {
    const form = vaultForm({ initialized: false } as AppState, async () => {});
    document.body.append(form);
    const inputs = form.querySelectorAll('input');
    inputs[0].value = 'synthetic-master-123';
    inputs[1].value = 'different-master-123';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(form.textContent).toContain('passwords do not match');
    expect(inputs[0].type).toBe('password');
    expect(form.textContent).toContain('no password recovery');
  });
  it('never invents success on a failed worker acknowledgement', async () => {
    vi.stubGlobal('chrome', {
      runtime: { sendMessage: vi.fn().mockResolvedValue({ ok: false, error: 'Vault locked.' }) },
    });
    await expect(request({ type: 'LOCK' })).rejects.toThrow('Vault locked.');
  });
});
