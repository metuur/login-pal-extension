// This preview uses only fictional metadata; it never reads extension state.
const search = document.querySelector<HTMLInputElement>('#account-search')!;
const accounts = Array.from(document.querySelectorAll<HTMLButtonElement>('.account'));
const fill = document.querySelector<HTMLButtonElement>('#demo-fill')!;
const demoStatus = document.querySelector<HTMLElement>('#demo-status')!;
let selected: HTMLButtonElement | undefined = accounts[0];

function selectAccount(account: HTMLButtonElement | undefined): void {
  selected = account;
  accounts.forEach((item) => {
    item.classList.toggle('selected', item === account);
    item.setAttribute('aria-pressed', String(item === account));
  });
  fill.disabled = !account;
  demoStatus.textContent = account
    ? `${account.dataset.name} selected. Demo only; nothing is filled.`
    : 'No account selected. Try a different search.';
}

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
  if (selected)
    demoStatus.textContent = `Demo: ${selected.dataset.name} is ready. In the extension, review → Autofill → press the site’s Login button yourself.`;
});

const menu = document.querySelector<HTMLDialogElement>('#mobile-menu')!;
const menuButton = document.querySelector<HTMLButtonElement>('.menu-button')!;
menuButton.addEventListener('click', () => {
  menu.showModal();
  menuButton.setAttribute('aria-expanded', 'true');
});
document.querySelector('.menu-close')!.addEventListener('click', () => menu.close());
menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => menu.close()));
menu.addEventListener('close', () => menuButton.setAttribute('aria-expanded', 'false'));
document.addEventListener('keydown', (event: KeyboardEvent) => {
  const target = event.target;
  const editing =
    target instanceof HTMLElement &&
    (target.matches('input, textarea, select') || target.isContentEditable);
  if (
    event.key === '/' &&
    !editing &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    !menu.open
  ) {
    event.preventDefault();
    search.focus();
  }
});

if (
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
  'IntersectionObserver' in window
) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.remove('pending');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08 },
  );
  document.querySelectorAll('.reveal').forEach((element) => {
    element.classList.add('pending');
    observer.observe(element);
  });
}
