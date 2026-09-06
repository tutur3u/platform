import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { logoutCurrentWebAccountWithInternalApi } from '@tuturuuu/internal-api/auth';
import { colabRequest } from '@tuturuuu/internal-api/colab';
import type { Identity } from '@tuturuuu/multiplayer';
import { Button } from '@tuturuuu/ui/button';
import {
  clearLocalePreference,
  persistLocalePreference,
} from '@tuturuuu/ui/custom/locale-preference';
import {
  type SidebarBehavior,
  SidebarProvider,
} from '@tuturuuu/ui/custom/sidebar-context';
import { Toaster } from '@tuturuuu/ui/sonner';
import { ThemeProvider } from 'next-themes';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Home } from './home';
import {
  type Locale,
  LocaleContext,
  LocalePreferenceContext,
  useCopy,
} from './i18n';
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
      loading={session.isPending}
      onLogout={async () => {
        if (session.data?.identity?.email) {
          await logoutCurrentWebAccountWithInternalApi({
            baseUrl: 'https://tuturuuu.com',
          }).catch(() => null);
        }
        await colabRequest('/logout', {});
        location.assign(
          session.data?.identity?.email
            ? 'https://tuturuuu.com/logout?from=Colab'
            : '/'
        );
      }}
      onLocaleChange={(value) => changeLocale(value)}
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
let changeLocale: (locale: Locale | undefined) => void;
function initialSidebarBehavior(): SidebarBehavior {
  const stored = document.cookie
    .split('; ')
    .find((value) => value.startsWith('sidebar-behavior='))
    ?.split('=')[1];
  return stored === 'collapsed' || stored === 'hover' || stored === 'hidden'
    ? stored
    : 'expanded';
}
function Root() {
  const [preference, setPreference] = useState<Locale | undefined>(() => {
    const saved =
      document.cookie
        .split('; ')
        .find((value) => value.startsWith('NEXT_LOCALE='))
        ?.split('=')[1] ?? localStorage.getItem('colab-locale');
    return saved === 'en' || saved === 'vi' ? saved : undefined;
  });
  const locale =
    preference ?? (navigator.language.startsWith('vi') ? 'vi' : 'en');
  document.documentElement.lang = locale;
  changeLocale = (value) => {
    if (value) {
      localStorage.setItem('colab-locale', value);
      persistLocalePreference(value);
    } else {
      localStorage.removeItem('colab-locale');
      clearLocalePreference();
    }
    setPreference(value);
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
        <LocalePreferenceContext value={preference}>
          <QueryClientProvider client={queryClient}>
            <SidebarProvider initialBehavior={initialSidebarBehavior()}>
              <App />
              <Toaster />
            </SidebarProvider>
          </QueryClientProvider>
        </LocalePreferenceContext>
      </LocaleContext>
    </ThemeProvider>
  );
}
const root = document.getElementById('root');
if (root) createRoot(root).render(<Root />);
