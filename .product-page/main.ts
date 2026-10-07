let openWorkflowStep: ((step: number, manual?: boolean) => void) | undefined;

function setupAccountDemo(): void {
  // This preview uses only fictional metadata; it never reads extension state.
  const search = document.querySelector<HTMLInputElement>('#account-search');
  const accounts = Array.from(document.querySelectorAll<HTMLButtonElement>('.account'));
  const fill = document.querySelector<HTMLButtonElement>('#demo-fill');
  const demoStatus = document.querySelector<HTMLElement>('#demo-status');
  if (!search || !fill || !demoStatus) return;
  let selected: HTMLButtonElement | undefined = accounts[0];

  const selectAccount = (account: HTMLButtonElement | undefined): void => {
    selected = account;
    accounts.forEach((item) => {
      item.classList.toggle('selected', item === account);
      item.setAttribute('aria-pressed', String(item === account));
    });
    fill.disabled = !account;
    const selectedName = document.querySelector<HTMLElement>('#flow-selected-name');
    if (selectedName && account)
      selectedName.textContent = account.dataset.name ?? 'Selected account';
    demoStatus.textContent = account
      ? `${account.dataset.name} selected. Demo only; nothing is filled.`
      : 'No account selected. Try a different search.';
  };

  accounts.forEach((account) => account.addEventListener('click', () => selectAccount(account)));
  search.addEventListener('input', () => {
    const query = search.value.trim().toLowerCase();
    accounts.forEach((account) => {
      account.hidden = !`${account.dataset.search} ${account.textContent}`
        .toLowerCase()
        .includes(query);
    });
    const visible = accounts.filter((account) => !account.hidden);
    document.querySelector<HTMLElement>('#account-count')!.textContent =
      `${visible.length} account${visible.length === 1 ? '' : 's'}`;
    document.querySelector<HTMLElement>('#no-results')!.hidden = visible.length !== 0;
    if (!selected || selected.hidden) selectAccount(visible[0]);
  });
  fill.addEventListener('click', () => {
    if (selected) {
      demoStatus.textContent = `Demo: ${selected.dataset.name} is ready. In the extension, review → Autofill → press the site’s Login button yourself.`;
      openWorkflowStep?.(3, true);
    }
  });
}
setupAccountDemo();

const menu = document.querySelector<HTMLDialogElement>('#mobile-menu')!;
const menuButton = document.querySelector<HTMLButtonElement>('.menu-button')!;
menuButton.addEventListener('click', () => {
  menu.showModal();
  menuButton.setAttribute('aria-expanded', 'true');
});
document.querySelector('.menu-close')!.addEventListener('click', () => menu.close());
menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => menu.close()));
menu.addEventListener('close', () => menuButton.setAttribute('aria-expanded', 'false'));
// Native details stay usable without JavaScript; topic links also open their target.
function openDocumentationTopic(): void {
  const topic = document.getElementById(location.hash.slice(1));
  if (topic instanceof HTMLDetailsElement && topic.classList.contains('doc-article')) {
    topic.open = true;
  }
}
window.addEventListener('hashchange', openDocumentationTopic);
document.querySelectorAll<HTMLAnchorElement>('a[href^="#docs-"]').forEach((link) => {
  link.addEventListener('click', () => {
    const topic = document.getElementById(link.hash.slice(1));
    if (topic instanceof HTMLDetailsElement) topic.open = true;
  });
});
openDocumentationTopic();
document.addEventListener('keydown', (event: KeyboardEvent) => {
  const search = document.querySelector<HTMLInputElement>('#account-search');
  const target = event.target;
  const editing =
    target instanceof HTMLElement &&
    (target.matches('input, textarea, select') || target.isContentEditable);
  if (
    search &&
    event.key === '/' &&
    !editing &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    !menu.open
  ) {
    event.preventDefault();
    openWorkflowStep?.(2, true);
    search.focus();
  }
});

function setupWorkflowDemo(): void {
  const root = document.querySelector<HTMLElement>('#workflow-demo');
  const play = document.querySelector<HTMLButtonElement>('#flow-play');
  const stepGroup = document.querySelector<HTMLElement>('.flow-steps');
  if (!root || !play || !stepGroup) return;
  const panels = Array.from(root.querySelectorAll<HTMLElement>('[data-flow-panel]'));
  const stepButtons = Array.from(
    stepGroup.querySelectorAll<HTMLButtonElement>('[data-flow-target]'),
  );
  const progressBars = stepButtons.map((button) => button.querySelector<HTMLElement>('i')!);
  const position = root.querySelector<HTMLElement>('#flow-position')!;
  const announcement = root.querySelector<HTMLElement>('#flow-announcement')!;
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const query = new URLSearchParams(location.search);
  const reduced = (): boolean => motionPreference.matches || query.get('reduce') === '1';
  const canAnimate = typeof Element.prototype.animate === 'function';
  const duration = 6000;
  let active = 0;
  let visible = !('IntersectionObserver' in window);
  let wanted = !reduced() && canAnimate;
  let completed = false;
  let manualTransition = false;
  let clock: Animation | undefined;
  let entrances: Animation[] = [];

  const syncPlayback = (): void => {
    const inView = visible && !document.hidden && !menu.open;
    const playing = wanted && inView && !reduced();
    if (clock && clock.playState !== 'finished') {
      if (playing) clock.play();
      else clock.pause();
    }
    entrances.forEach((animation) => {
      if (animation.playState === 'finished') return;
      if (inView && (wanted || manualTransition)) animation.play();
      else animation.pause();
    });
    play.hidden = reduced() || !canAnimate;
    play.textContent = completed ? 'Replay tour' : playing ? 'Pause tour' : 'Play tour';
    root.dataset.playing = String(playing);
  };

  const showStep = (index: number, manual = false): void => {
    if (!Number.isInteger(index) || index < 0 || index >= panels.length) return;
    const focusWasInside = panels[active]!.contains(document.activeElement);
    if (manual) wanted = false;
    completed = false;
    manualTransition = manual;
    if (clock) {
      clock.onfinish = null;
      clock.cancel();
    }
    entrances.forEach((animation) => animation.cancel());
    entrances = [];
    active = index;
    root.dataset.step = String(index);
    // Keep every stage in the grid to reserve a stable height. Inactive stages
    // remain inaccessible to keyboard and assistive technology.
    panels.forEach((panel, i) => {
      panel.hidden = false;
      panel.inert = i !== index;
      panel.classList.toggle('is-inactive', i !== index);
      panel.setAttribute('aria-hidden', String(i !== index));
    });
    stepButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    progressBars.forEach((bar, i) => {
      bar.style.transform = `scaleX(${i < index ? 1 : 0})`;
    });
    position.textContent = `${index + 1} of ${panels.length}`;
    const panel = panels[index]!;
    if (canAnimate) {
      // User-triggered reduced-motion transitions retain a short orientation fade.
      const items = reduced()
        ? [panel]
        : [panel, ...panel.querySelectorAll<HTMLElement>('.flow-item')];
      entrances = items.map((item, i) =>
        item.animate(
          reduced()
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [
                { opacity: 0, transform: 'translateY(10px)' },
                { opacity: 1, transform: 'translateY(0)' },
              ],
          {
            duration: reduced() ? 120 : 400,
            delay: reduced() ? 0 : i * 70,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'backwards',
          },
        ),
      );
      clock = progressBars[index]!.animate(
        [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
        { duration, easing: 'linear', fill: 'forwards' },
      );
      clock.pause();
      clock.onfinish = () => {
        if (active !== index) return;
        if (index < panels.length - 1) showStep(index + 1);
        else {
          wanted = false;
          completed = true;
          syncPlayback();
        }
      };
    }
    if (manual) {
      const title = panel.querySelector('h2')!.innerText.replace(/\s+/g, ' ');
      announcement.textContent = `Step ${index + 1}: ${title}`;
      if (focusWasInside) {
        const heading = panel.querySelector<HTMLElement>('h2')!;
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
      }
    }
    syncPlayback();
    // Initial reduced-motion state should be immediately readable without autoplay.
    if (reduced() && !manual) entrances.forEach((animation) => animation.finish());
  };
  openWorkflowStep = showStep;
  root.querySelectorAll<HTMLButtonElement>('[data-flow-target]').forEach((button) => {
    button.hidden = false;
    button.addEventListener('click', () => showStep(Number(button.dataset.flowTarget), true));
  });
  stepGroup.hidden = false;
  position.hidden = false;
  play.addEventListener('click', () => {
    manualTransition = false;
    if (completed) {
      wanted = true;
      showStep(0);
    } else {
      wanted = !wanted;
      syncPlayback();
    }
  });
  // Interaction takes ownership of the demo; never advance away from an active input.
  const takeControl = (event: Event): void => {
    if (!(event.target instanceof Element) || !event.target.closest('.flow-panel')) return;
    wanted = false;
    manualTransition = false;
    entrances.forEach((animation) => animation.finish());
    syncPlayback();
  };
  root.addEventListener('focusin', takeControl);
  root.addEventListener('pointerdown', takeControl);
  motionPreference.addEventListener('change', () => {
    wanted = false;
    showStep(active, true);
  });
  document.addEventListener('visibilitychange', syncPlayback);
  menuButton.addEventListener('click', syncPlayback);
  menu.addEventListener('close', syncPlayback);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? false;
        syncPlayback();
      },
      { threshold: 0.25 },
    ).observe(root);
  }
  showStep(0);
  // Deterministic capture: ?t=0..24 freezes a moment; ?reduce=1 tests static navigation.
  const time = query.get('t');
  if (time !== null && time.trim() !== '' && Number.isFinite(Number(time))) {
    const bounded = Math.max(0, Math.min(24, Number(time)));
    wanted = false;
    showStep(Math.min(3, Math.floor(bounded / 6)));
    const localTime = bounded >= 24 ? duration : (bounded % 6) * 1000;
    if (clock) {
      clock.onfinish = null;
      clock.pause();
      clock.currentTime = localTime;
    }
    entrances.forEach((animation) => {
      animation.pause();
      animation.currentTime = reduced() ? duration : localTime;
    });
    syncPlayback();
  }
  const openPicker = (): void => {
    showStep(2, true);
    document.querySelector<HTMLInputElement>('#account-search')?.focus({ preventScroll: true });
  };
  document.querySelector('#try-demo-link')?.addEventListener('click', openPicker);
  window.addEventListener('hashchange', () => {
    if (location.hash === '#account-search') openPicker();
  });
  if (location.hash === '#account-search') openPicker();
  root.dataset.ready = 'true';
}
setupWorkflowDemo();
