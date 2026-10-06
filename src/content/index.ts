import { matchesOrigin } from '../domain/rules';
import type {
  Attempt,
  ContentContext,
  ContentInstruction,
  ContentRequest,
  LoginProfile,
  Reply,
} from '../shared/types';
import { fillFields, inspectFields, loginFields, routeMatches, successVisible } from './fields';

const scope = globalThis as typeof globalThis & { __oneChatContent?: boolean };
if (window === window.top && !scope.__oneChatContent) {
  scope.__oneChatContent = true;
  let stopTracking = () => {};
  async function request(message: ContentRequest): Promise<ContentContext | undefined> {
    try {
      const reply = (await chrome.runtime.sendMessage(message)) as Reply<ContentContext>;
      return reply?.ok ? reply.data : undefined;
    } catch {
      return undefined;
    }
  }
  function track(attempt: Attempt, profile: LoginProfile) {
    stopTracking();
    let tracked: HTMLInputElement[] = [];
    try {
      tracked = loginFields(profile, document);
    } catch {
      /* Success pages need no login inputs. */
    }
    let stopped = false,
      busy = false;
    const cleanup = () => {
      stopped = true;
      clearInterval(timer);
      observer.disconnect();
      document.removeEventListener('input', onEdit, true);
      document.removeEventListener('change', onEdit, true);
    };
    stopTracking = cleanup;
    const cancel = () => {
      cleanup();
      void request({ type: 'CANCEL_ATTEMPT', token: attempt.token });
    };
    function onEdit(event: Event) {
      if (!matchesOrigin(profile.login, location.href)) return;
      const node = event.target;
      if (node instanceof Element) {
        try {
          if (
            tracked.includes(node as HTMLInputElement) ||
            loginFields(profile, document).includes(node as HTMLInputElement)
          )
            cancel();
        } catch {
          cancel();
        }
      }
    }
    async function tick() {
      if (stopped || busy) return;
      if (Date.now() >= attempt.expiresAt) {
        cancel();
        return;
      }
      if (
        !matchesOrigin(profile.login, location.href) &&
        !(profile.success && routeMatches(profile.success.route, location.href))
      ) {
        cancel();
        return;
      }
      busy = true;
      try {
        const context = await request({ type: 'CONTENT_CONTEXT' });
        if (stopped) return;
        if (context?.attempt?.token !== attempt.token) {
          cleanup();
          return;
        }
        if (context.attempt.acknowledged === false) return;
        if (successVisible(profile, document)) {
          const result = (await chrome.runtime.sendMessage({
            type: 'SUCCESS_OBSERVED',
            token: attempt.token,
          })) as Reply<unknown>;
          if (result?.ok) cleanup();
          else {
            const current = await request({ type: 'CONTENT_CONTEXT' });
            if (current?.attempt?.token !== attempt.token) cleanup();
          }
        }
      } catch {
        cleanup();
      } finally {
        busy = false;
      }
    }
    const observer = new MutationObserver(() => void tick());
    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['hidden', 'class', 'style'],
    });
    const timer = setInterval(() => void tick(), 250);
    document.addEventListener('input', onEdit, true);
    document.addEventListener('change', onEdit, true);
    void tick();
  }
  chrome.runtime.onMessage.addListener((message: ContentInstruction, sender, respond) => {
    if (sender.id !== chrome.runtime.id || !message || typeof message !== 'object') return;
    if (message.type === 'INSPECT') {
      respond(inspectFields(message.profile));
      return;
    }
    if (message.type === 'FILL_FIELDS') {
      stopTracking();
      if (typeof message.username !== 'string' || typeof message.password !== 'string') {
        respond({ ok: false, error: 'Invalid fill request.' });
        return;
      }
      const result = fillFields(message.profile, message.username, message.password);
      if (result.ok && message.attempt) track(message.attempt, message.profile);
      respond(result);
      return;
    }
    if (message.type === 'TRACK') {
      track(message.attempt, message.profile);
      respond({ ok: true });
    }
  });
  void request({ type: 'CONTENT_CONTEXT' }).then((context) => {
    if (context?.attempt && context.profile) track(context.attempt, context.profile);
  });
}
