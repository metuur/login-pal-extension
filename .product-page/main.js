'use strict';
function setupAccountDemo() {
  const search = document.querySelector('#account-search');
  const accounts = Array.from(document.querySelectorAll('.account'));
  const fill = document.querySelector('#demo-fill');
  const demoStatus = document.querySelector('#demo-status');
  if (!search || !fill || !demoStatus) return;
  let selected = accounts[0];
  const selectAccount = (account) => {
    selected = account;
    accounts.forEach((item) => {
      item.classList.toggle('selected', item === account);
      item.setAttribute('aria-pressed', String(item === account));
    });
    fill.disabled = !account;
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
    document.querySelector('#account-count').textContent =
      `${visible.length} account${visible.length === 1 ? '' : 's'}`;
    document.querySelector('#no-results').hidden = visible.length !== 0;
    if (!selected || selected.hidden) selectAccount(visible[0]);
  });
  fill.addEventListener('click', () => {
    if (selected)
      demoStatus.textContent = `Demo: ${selected.dataset.name} is ready. In the extension, review \u2192 Autofill \u2192 press the site\u2019s Login button yourself.`;
  });
}
setupAccountDemo();
const menu = document.querySelector('#mobile-menu');
const menuButton = document.querySelector('.menu-button');
menuButton.addEventListener('click', () => {
  menu.showModal();
  menuButton.setAttribute('aria-expanded', 'true');
});
document.querySelector('.menu-close').addEventListener('click', () => menu.close());
menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => menu.close()));
menu.addEventListener('close', () => menuButton.setAttribute('aria-expanded', 'false'));
function openDocumentationTopic() {
  const topic = document.getElementById(location.hash.slice(1));
  if (topic instanceof HTMLDetailsElement && topic.classList.contains('doc-article')) {
    topic.open = true;
  }
}
window.addEventListener('hashchange', openDocumentationTopic);
document.querySelectorAll('a[href^="#docs-"]').forEach((link) => {
  link.addEventListener('click', () => {
    const topic = document.getElementById(link.hash.slice(1));
    if (topic instanceof HTMLDetailsElement) topic.open = true;
  });
});
openDocumentationTopic();
document.addEventListener('keydown', (event) => {
  const search = document.querySelector('#account-search');
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
    search.focus();
  }
});
