import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { colabRequest } from '@tuturuuu/internal-api/colab';
import type { Identity } from '@tuturuuu/multiplayer';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Home } from './home';
import { type Locale, LocaleContext, useCopy } from './i18n';
import { Structure } from './structure';
import { Workshop } from './workshop';
import './app.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true } },
});
function App() {
  const c = useCopy();
  const [authRetry, setAuthRetry] = useState(
    new URLSearchParams(location.search).has('auth')
  );
  const [roomId, setRoomId] = useState(
    new URLSearchParams(location.search).get('room') ?? ''
  );
  const session = useQuery({
    queryKey: ['session'],
    queryFn: () =>
      colabRequest<{ identity: Identity | null; canHost: boolean }>('/session'),
  });
  const navigate = (id: string) => {
    setRoomId(id);
    history.replaceState(null, '', id ? `/?room=${id}` : '/');
    if (id) localStorage.setItem('colab-recent-room', id);
  };
  return (
    <Structure
      roomId={roomId}
      identity={session.data?.identity ?? null}
      navigate={navigate}
      actions={
        <div className="topbar-actions">
          <Language />
          {session.data?.identity ? (
            <button
              type="button"
              className="quiet"
              onClick={async () => {
                await colabRequest('/logout', {});
                location.assign('/');
              }}
            >
              {c.logout}
            </button>
          ) : (
            <a className="button quiet" href="/auth/login">
              {c.login} <span aria-hidden="true">↗</span>
            </a>
          )}
        </div>
      }
    >
      {authRetry && (
        <section className="auth-recovery" role="alert">
          <div>
            <h2>{c.authRetryTitle}</h2>
            <p>{c.authRetryText}</p>
          </div>
          <div className="hero-actions">
            <a className="button primary" href="/auth/login">
              {c.login}
            </a>
            <button
              type="button"
              className="quiet"
              onClick={() => {
                setAuthRetry(false);
                history.replaceState(null, '', '/');
              }}
            >
              {c.authDismiss}
            </button>
          </div>
        </section>
      )}
      {roomId ? (
        <Workshop
          roomId={roomId}
          identity={session.data?.identity ?? null}
          leave={() => navigate('')}
        />
      ) : (
        <Home
          canHost={session.data?.canHost ?? false}
          identity={session.data?.identity ?? null}
          navigate={navigate}
        />
      )}
      <footer>
        <span>{c.tagline}</span>
        <span>{c.sandbox}</span>
      </footer>
    </Structure>
  );
}
let changeLocale: (locale: Locale) => void;
function Language() {
  const c = useCopy();
  return (
    <select
      className="language"
      aria-label={c.language}
      defaultValue={document.documentElement.lang}
      onChange={(e) => changeLocale(e.target.value as Locale)}
    >
      <option value="en">EN</option>
      <option value="vi">VI</option>
    </select>
  );
}
function Root() {
  const [locale, setLocale] = useState<Locale>(
    localStorage.getItem('colab-locale') === 'vi' ? 'vi' : 'en'
  );
  document.documentElement.lang = locale;
  changeLocale = (value) => {
    localStorage.setItem('colab-locale', value);
    setLocale(value);
  };
  return (
    <LocaleContext value={locale}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </LocaleContext>
  );
}
const root = document.getElementById('root');
if (root) createRoot(root).render(<Root />);
