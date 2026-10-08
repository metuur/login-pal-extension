import { useEffect, useRef, useState } from 'react';
import { icon, versionFooter } from '../src/ui/common';

const MAIN = '/popup.html';
const SETTINGS = '/options.html';

function Icon({ name }: { name: Parameters<typeof icon>[0] }) {
  const slot = useRef<HTMLSpanElement>(null);
  useEffect(() => slot.current?.replaceChildren(icon(name)), [name]);
  return <span className="icon-slot" ref={slot} />;
}

function VersionFooter() {
  const slot = useRef<HTMLDivElement>(null);
  useEffect(() => slot.current?.replaceChildren(versionFooter()), []);
  return <div className="icon-slot" ref={slot} />;
}

export default function App() {
  const [page, setPage] = useState(
    new URLSearchParams(location.search).get('view') === 'settings' ? SETTINGS : MAIN,
  );
  useEffect(() => {
    const navigate = (event: Event) => {
      const url = new URL((event as CustomEvent<string>).detail);
      setPage(url.pathname + url.search + url.hash);
    };
    window.addEventListener('preview-navigate', navigate);
    return () => window.removeEventListener('preview-navigate', navigate);
  }, []);
  const settings = page.startsWith(SETTINGS);
  return (
    <div className="workspace">
      <header className="app-header">
        <div className="header-line">
          <div className="brand">
            <div className="logo" aria-hidden="true" />
            <strong>Login Pal</strong>
          </div>
          <div className="header-actions">
            {settings ? (
              <button
                type="button"
                className="icon-button"
                aria-label="Back to account search"
                title="Back to account search"
                onClick={() => setPage(MAIN)}
              >
                <Icon name="back" />
              </button>
            ) : (
              <button
                type="button"
                className="icon-button"
                aria-label="Settings"
                title="Settings"
                onClick={() => setPage(SETTINGS)}
              >
                <Icon name="settings" />
              </button>
            )}
          </div>
        </div>
      </header>
      <iframe
        key={page}
        src={page}
        title={settings ? 'Account settings' : 'Account login search'}
      />
      <VersionFooter />
    </div>
  );
}
