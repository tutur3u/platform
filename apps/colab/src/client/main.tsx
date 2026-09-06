import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { colabRequest } from '@tuturuuu/internal-api/colab';
import type { Identity } from '@tuturuuu/multiplayer';
import { Button } from '@tuturuuu/ui/button';
import { ThemeProvider } from 'next-themes';
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
        <div className="flex flex-wrap items-center gap-2">
          <Language />
          {session.data?.identity ? (
            <Button
              type="button"
              variant="ghost"
              onClick={async () => {
                await colabRequest('/logout', {});
                location.assign('/');
              }}
            >
              {c.logout}
            </Button>
          ) : (
            <Button variant="ghost" asChild>
              <a href="/auth/login">{c.login}</a>
            </Button>
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
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setAuthRetry(false);
                history.replaceState(null, '', '/');
              }}
            >
              {c.authDismiss}
            </Button>
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
      className="w-20 rounded-md border bg-background p-2 text-foreground text-sm"
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
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      scriptProps={{ 'data-cfasync': 'false' }}
    >
      <LocaleContext value={locale}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </LocaleContext>
    </ThemeProvider>
  );
}
const root = document.getElementById('root');
if (root) createRoot(root).render(<Root />);
