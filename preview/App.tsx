import { useEffect, useState } from 'react';

export default function App() {
  const [page, setPage] = useState(
    new URLSearchParams(location.search).get('view') === 'popup' ? '/popup.html' : '/options.html',
  );
  useEffect(() => {
    const navigate = (event: Event) => {
      const url = new URL((event as CustomEvent<string>).detail);
      setPage(url.pathname + url.search + url.hash);
    };
    window.addEventListener('preview-navigate', navigate);
    return () => window.removeEventListener('preview-navigate', navigate);
  }, []);
  return (
    <main className="workspace">
      <header>
        <span className="eyebrow">LOCAL WORKSPACE</span>
        <h1>OneChat Login Assistant</h1>
        <p>Manage your synthetic account groups in a live browser workspace.</p>
      </header>
      <nav aria-label="Screens">
        <button aria-pressed={page.startsWith('/options')} onClick={() => setPage('/options.html')}>
          Settings
        </button>
        <button aria-pressed={page.startsWith('/popup')} onClick={() => setPage('/popup.html')}>
          Popup
        </button>
      </nav>
      <div className="screen">
        <iframe
          key={page}
          src={page}
          title={page.startsWith('/popup') ? 'Account popup' : 'Account settings'}
        />
      </div>
      <aside>
        Imports, groups, search and CSV exports work locally. Profile permission is simulated here;
        autofill into other websites requires the installed Chrome extension. Preview data stays
        separate from extension data.
      </aside>
    </main>
  );
}
