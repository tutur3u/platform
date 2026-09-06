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
import { HostWorkshopDialog } from './host-dialog';
import {
  type Locale,
  LocaleContext,
  LocalePreferenceContext,
  useCopy,
} from './i18n';
import { JoinRoomDialog } from './join-dialog';
import { navigateWorkspace, useWorkspaceLocation } from './navigation';
import { Structure } from './structure';
import { Workshop } from './workshop';
import { WorkspacePages } from './workspace-pages';
import './app.css';
import './workspace.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: true } },
});
function App() {
  const c = useCopy();
  const [authRetry, setAuthRetry] = useState(
    new URLSearchParams(location.search).has('auth')
  );
  const current = useWorkspaceLocation();
  const route = new URL(current, location.origin);
  const roomId = route.searchParams.get('room') ?? '';
  const hostOpen = route.pathname === '/host' || route.searchParams.has('host');
  const joinOpen =
    !hostOpen && (route.pathname === '/join' || route.searchParams.has('join'));
  const session = useQuery({
    queryKey: ['session'],
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: 2,
    queryFn: () =>
      colabRequest<{ identity: Identity | null; canHost: boolean }>('/session'),
  });
  const navigate = (id: string) => {
    navigateWorkspace(id ? `/?room=${id}` : '/');
    if (id) localStorage.setItem('colab-recent-room', id);
  };
  if (!roomId && (!session.data?.identity?.email || session.isPending)) {
    return (
      <div className="workspace-login">
        <section>
          <h1>Colab</h1>
          <p>
            {session.isPending
              ? c.loadingAccount
              : session.isError
                ? c.workspace.sessionUnavailable
                : c.workspace.description}
          </p>
          {session.isError && (
            <Button onClick={() => void session.refetch()}>
              {c.common.retry}
            </Button>
          )}
          {!session.isPending && !session.isError && (
            <>
              <Button asChild className="w-full">
                <a
                  href={`/auth/login?returnTo=${encodeURIComponent(location.pathname + location.search + location.hash)}`}
                >
                  {c.login}
                </a>
              </Button>
              {authRetry && (
                <p role="alert" className="mt-4">
                  {c.authRetryText}
                </p>
              )}
            </>
          )}
        </section>
      </div>
    );
  }
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
      <HostWorkshopDialog
        key={session.data?.identity?.id ?? 'guest'}
        open={hostOpen}
        canHost={session.data?.canHost ?? false}
        navigate={navigate}
      />
      <JoinRoomDialog open={joinOpen} navigate={navigate} />
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
                navigateWorkspace('/', true);
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
        <WorkspacePages
          canHost={session.data?.canHost ?? false}
          identity={session.data?.identity ?? null}
          navigate={navigate}
        />
      )}
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
