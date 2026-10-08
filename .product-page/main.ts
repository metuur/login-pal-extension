let openWorkflowStep: ((step: number, manual?: boolean) => void) | undefined;

function setupAccountDemo(): void {
  // This preview uses only fictional metadata; it never reads extension state.
  const search = document.querySelector<HTMLInputElement>('#account-search');
  const accounts = Array.from(document.querySelectorAll<HTMLButtonElement>('.account'));
  const fill = document.querySelector<HTMLButtonElement>('#demo-fill');
  const demoStatus = document.querySelector<HTMLElement>('#demo-status');
  if (!search || !fill || !demoStatus) return;
  let selected: HTMLButtonElement | undefined = accounts[0];
  let role = 'all';
  const filters = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-role]'));
  const filterGroup = document.querySelector<HTMLElement>('.role-filters');
  if (filterGroup) filterGroup.hidden = false;

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
  const filterAccounts = (): void => {
    const query = search.value.trim().toLowerCase();
    accounts.forEach((account) => {
      const text = `${account.dataset.search} ${account.textContent}`.toLowerCase();
      const matchesRole =
        role === 'all' || account.querySelector('.role')?.textContent?.toLowerCase() === role;
      account.hidden = !text.includes(query) || !matchesRole;
    });
    const visible = accounts.filter((account) => !account.hidden);
    document.querySelector<HTMLElement>('#account-count')!.textContent =
      `${visible.length} account${visible.length === 1 ? '' : 's'}`;
    document.querySelector<HTMLElement>('#no-results')!.hidden = visible.length !== 0;
    if (!selected || selected.hidden) selectAccount(visible[0]);
  };
  search.addEventListener('input', filterAccounts);
  filters.forEach((button) =>
    button.addEventListener('click', () => {
      role = button.dataset.role ?? 'all';
      filters.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      filterAccounts();
    }),
  );
  fill.addEventListener('click', () => {
    if (selected) {
      demoStatus.textContent = `Demo: ${selected.dataset.name} is ready. In the extension, review → Autofill → press the site’s Login button yourself.`;
      openWorkflowStep?.(4, true);
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
menu.addEventListener('click', (event) => {
  if (event.target !== menu) return;
  const bounds = menu.getBoundingClientRect();
  if (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  )
    menu.close();
});
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
    openWorkflowStep?.(3, true);
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
  const durations = panels.map((_, index) => (index === 0 ? 4000 : 2500));
  let active = 0;
  let visible = !('IntersectionObserver' in window);
  let wanted = false;
  let manualTransition = false;
  let hovered = false;
  let clock: Animation | undefined;
  let entrances: Animation[] = [];

  const syncPlayback = (): void => {
    const inView = visible && !document.hidden && !menu.open;
    const playing = wanted && inView && !hovered && !reduced();
    if (clock && clock.playState !== 'finished') {
      if (playing) clock.play();
      else clock.pause();
    }
    entrances.forEach((animation) => {
      if (animation.playState === 'finished') return;
      if (inView && (manualTransition || (wanted && !hovered))) animation.play();
      else animation.pause();
    });
    play.hidden = reduced() || !canAnimate;
    play.textContent = playing ? 'Pause tour' : 'Play tour';
    root.dataset.playing = String(playing);
  };

  const animateScene = (panel: HTMLElement, step: number): Animation[] => {
    if (reduced()) return [];
    const animations = [
      panel.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: reduced() ? 120 : 160,
        fill: 'backwards',
      }),
    ];
    if (reduced()) return animations;
    // Every detail shares the stage clock's pause, seek, and cleanup lifecycle.
    const tween = (
      selector: string,
      frames: Keyframe[],
      delay: number,
      length = 360,
      stagger = 0,
    ): void => {
      panel.querySelectorAll<HTMLElement>(selector).forEach((element, i) => {
        animations.push(
          element.animate(frames, {
            delay: (delay + i * stagger) * (step === 0 ? 1.35 : 1),
            duration: length * (step === 0 ? 1.35 : 1),
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'backwards',
          }),
        );
      });
    };
    const rise = [
      { opacity: 0, transform: 'translateY(5px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ];
    const pop = [
      { opacity: 0, transform: 'scale(0.9)' },
      { opacity: 1, transform: 'scale(1)' },
    ];
    const fillField = [
      { opacity: 0.8, transform: 'scaleX(0)', offset: 0 },
      { opacity: 0.8, transform: 'scaleX(1)', offset: 0.75 },
      { opacity: 0, transform: 'scaleX(1)', offset: 1 },
    ];
    if (step === 0) {
      tween('.dev-login-page', rise, 40, 320);
      tween(
        '.dev-login-waiting',
        [
          { transform: 'translateX(0)' },
          { transform: 'translateX(-1.5px)' },
          { transform: 'translateX(1.5px)' },
          { transform: 'translateX(0)' },
        ],
        300,
        280,
      );
      tween(
        '.hunt-note-inner',
        [
          { opacity: 0, transform: 'translateY(6px) scale(0.98)' },
          { opacity: 1, transform: 'translateY(0) scale(1)' },
        ],
        420,
        380,
        260,
      );
      tween('.chaos-caption', rise, 1380, 320);
    } else if (step === 1) {
      tween(
        '.csv-icon',
        [
          { opacity: 0, transform: 'translateY(-5px) rotate(-3deg)' },
          { opacity: 1, transform: 'translateY(0) rotate(0)' },
        ],
        40,
        440,
      );
      tween(
        '.csv-row',
        [
          { opacity: 0, transform: 'translateX(7px)' },
          { opacity: 1, transform: 'translateX(0)' },
        ],
        120,
        400,
        160,
      );
      tween('.csv-title .flow-check', pop, 800, 280);
      tween(
        '.flow-transfer > span:first-child',
        [
          { opacity: 0, transform: 'translateY(-5px)' },
          { opacity: 1, transform: 'translateY(2px)', offset: 0.7 },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        900,
        460,
      );
      tween('.flow-group', rise, 1040, 440);
    } else if (step === 2) {
      tween('.site-permission > strong', rise, 80);
      tween('.field-progress', fillField, 240, 650, 350);
      tween('.field-mapping b', rise, 650, 280, 350);
      tween('.permission-approved', rise, 1250, 400);
    } else if (step === 3) {
      tween('.account:not([hidden])', rise, 100, 400, 100);
      tween('.account.selected .selection', pop, 750, 280);
      tween(
        '.account.selected .avatar',
        [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }],
        750,
        420,
      );
      tween(
        '#demo-fill > span',
        [
          { transform: 'translateX(0)' },
          { transform: 'translateX(2px)' },
          { transform: 'translateX(0)' },
        ],
        1200,
        480,
      );
    } else {
      tween('.fill-identity', rise, 100);
      tween('.field-progress', fillField, 240, 650, 400);
      tween('.filled-row b', rise, 650, 280, 400);
      tween('.manual-submit small', rise, 1350, 350);
    }
    return animations;
  };

  const showStep = (index: number, manual = false): void => {
    if (!Number.isInteger(index) || index < 0 || index >= panels.length) return;
    const focusWasInside = panels[active]!.contains(document.activeElement);
    if (manual) wanted = false;
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
      entrances = animateScene(panel, index);
      clock = progressBars[index]!.animate(
        [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
        { duration: durations[index], easing: 'linear', fill: 'forwards' },
      );
      clock.pause();
      clock.onfinish = () => {
        if (active !== index) return;
        if (index === panels.length - 1) {
          wanted = false;
          syncPlayback();
        } else showStep(index + 1);
      };
    }
    if (manual) {
      const title = panel.querySelector('h2')!.innerText.replace(/\s+/g, ' ');
      announcement.textContent = `${panel.querySelector('.flow-step-label')!.textContent}: ${title}`;
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
    if (!wanted && (active === panels.length - 1 || active === 3)) {
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
    // Step navigation moves focus to its heading without interrupting the scene.
    if (event.type === 'focusin' && event.target.matches('.flow-panel h2')) return;
    wanted = false;
    manualTransition = false;
    entrances.forEach((animation) => animation.finish());
    syncPlayback();
  };
  panels.forEach((panel) => {
    panel.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse') return;
      hovered = true;
      syncPlayback();
    });
    panel.addEventListener('pointerleave', () => {
      hovered = false;
      syncPlayback();
    });
  });
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
  showStep(3);
  entrances.forEach((animation) => animation.finish());
  // Deterministic capture: ?t=seconds freezes a moment; ?reduce=1 tests static navigation.
  const time = query.get('t');
  if (time !== null && time.trim() !== '' && Number.isFinite(Number(time))) {
    const cycleDuration = durations.reduce((total, duration) => total + duration, 0);
    let localTime = (Math.max(0, Number(time)) * 1000) % cycleDuration;
    let scene = 0;
    while (scene < panels.length - 1 && localTime >= durations[scene]!) {
      localTime -= durations[scene]!;
      scene++;
    }
    wanted = false;
    showStep(scene);
    if (clock) {
      clock.pause();
      clock.currentTime = localTime;
    }
    entrances.forEach((animation) => {
      animation.pause();
      animation.currentTime = reduced() ? durations[scene]! : localTime;
    });
    syncPlayback();
  }
  const openPicker = (): void => {
    showStep(3, true);
    document.querySelector<HTMLInputElement>('#account-search')?.focus({ preventScroll: true });
  };
  document.querySelector('#try-demo-link')?.addEventListener('click', openPicker);
  window.addEventListener('hashchange', () => {
    if (location.hash === '#account-search') openPicker();
  });
  if (location.hash === '#account-search') openPicker();
  document.querySelectorAll<HTMLButtonElement>('[data-demo-step]').forEach((button) => {
    button.hidden = false;
    button.addEventListener('click', () => {
      showStep(Number(button.dataset.demoStep), true);
      root.scrollIntoView({ behavior: reduced() ? 'instant' : 'smooth', block: 'center' });
      const heading = panels[active]!.querySelector<HTMLElement>('h2')!;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    });
  });
  root.dataset.ready = 'true';
}
setupWorkflowDemo();

function setupInstallationGuide(): void {
  const checks = Array.from(document.querySelectorAll<HTMLInputElement>('.setup-check'));
  const progress = document.querySelector<HTMLElement>('#setup-progress');
  if (progress) {
    progress.hidden = false;
    checks.forEach((check) => {
      check.hidden = false;
      const number = check.previousElementSibling;
      if (number instanceof HTMLElement) number.hidden = true;
      check.addEventListener('change', () => {
        const count = checks.filter((item) => item.checked).length;
        progress.textContent =
          count === checks.length
            ? 'Installation checklist complete. Next: import your first group.'
            : `${count} of ${checks.length} steps complete`;
      });
    });
  }
  const copy = document.querySelector<HTMLButtonElement>('#copy-extensions');
  const status = document.querySelector<HTMLElement>('#copy-status');
  if (!copy || !status) return;
  const wrapper = copy.closest<HTMLElement>('.copy-address');
  if (wrapper) wrapper.hidden = false;
  copy.addEventListener('click', async () => {
    copy.disabled = true;
    copy.dataset.state = 'loading';
    copy.setAttribute('aria-busy', 'true');
    status.textContent = 'Copying address…';
    try {
      await navigator.clipboard.writeText('chrome://extensions');
      copy.dataset.state = 'success';
      status.textContent = 'Copied. Paste into Chrome’s address bar.';
    } catch {
      copy.dataset.state = 'error';
      status.textContent = 'Copy unavailable. Type chrome://extensions in Chrome’s address bar.';
    } finally {
      copy.disabled = false;
      copy.removeAttribute('aria-busy');
    }
  });
}
setupInstallationGuide();

function setupHeroSpotlight(): void {
  const hero = document.querySelector<HTMLElement>('.home-page .hero');
  if (!hero) return;
  const pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const forcedReduced = new URLSearchParams(location.search).get('reduce') === '1';
  let frame = 0;
  let clientX = 0;
  let clientY = 0;

  const reset = (): void => {
    cancelAnimationFrame(frame);
    frame = 0;
    delete hero.dataset.spotlight;
  };
  hero.addEventListener('pointermove', (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || !pointer.matches || motion.matches || forcedReduced)
      return;
    clientX = event.clientX;
    clientY = event.clientY;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const bounds = hero.getBoundingClientRect();
      hero.style.setProperty('--spotlight-x', `${clientX - bounds.left}px`);
      hero.style.setProperty('--spotlight-y', `${clientY - bounds.top}px`);
      hero.dataset.spotlight = 'active';
    });
  });
  hero.addEventListener('pointerleave', reset);
  hero.addEventListener('pointercancel', reset);
  pointer.addEventListener('change', reset);
  motion.addEventListener('change', reset);
  window.addEventListener('blur', reset);
  window.addEventListener('resize', reset);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) reset();
  });
}
setupHeroSpotlight();
