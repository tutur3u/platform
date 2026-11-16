import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { Profiler, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import enBundle from '../../../../apps/web/messages/en.json';
import viBundle from '../../../../apps/web/messages/vi.json';
import { MIRA_EMBEDDED_HEIGHT_CLASS } from '../../../../apps/web/src/app/[locale]/(dashboard)/[wsId]/(dashboard)/components/mira-dashboard-client-types';
import { Button } from '../../src/components/ui/button';
import {
  FinanceMonthCard,
  FinanceMonthCardSkeleton,
} from '../../src/components/ui/workspace-dashboard/finance-month-card';
import { MyTasksCard } from '../../src/components/ui/workspace-dashboard/my-tasks-card';
import { NextUpCard } from '../../src/components/ui/workspace-dashboard/next-up-card';
import { TimeCard } from '../../src/components/ui/workspace-dashboard/time-card';
import { TodayAgendaCard } from '../../src/components/ui/workspace-dashboard/today-agenda-card';
import { WorkspaceDashboardLayout } from '../../src/components/ui/workspace-dashboard/workspace-dashboard-layout';
import { fallbackMessages } from './fallback-messages';
import { type FixtureState, fixtureCalls, installFixtureApi, unexpectedRequests } from './fixture-api';
import './fixture.css';

/*
 * Tailwind reads class names from source text. The Mira size classes live in
 * apps/web, which this fixture's CSS does not scan, so they are repeated here
 * verbatim; main() fails loudly if they ever differ from the imported value.
 */
const MIRA_CLASS_SOURCE =
  'h-[min(40rem,calc(100dvh-8rem))] min-h-[26rem] @max-[40rem]/dashboard:h-[min(18rem,45dvh)] @max-[40rem]/dashboard:min-h-[13rem]';

const params = new URLSearchParams(location.search);
const locale = params.get('locale') === 'vi' ? 'vi' : 'en';
const state = (params.get('state') ?? 'ready') as FixtureState;
const sorbet = params.get('ui') === 'sorbet';
const sidebar = params.get('sidebar') ?? 'expanded';
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark');
if (sorbet) document.documentElement.dataset.ui = 'sorbet';

installFixtureApi({
  state,
  longNames: params.get('names') !== 'short',
  goal: params.get('goal') === 'unset' ? 'unset' : 'set',
});

type Messages = Record<string, unknown>;
function withFallback(bundle: Messages, fallback: Messages): Messages {
  const merged: Messages = { ...fallback, ...bundle };
  for (const [key, value] of Object.entries(fallback)) {
    const own = bundle[key];
    if (value && typeof value === 'object' && own && typeof own === 'object') {
      merged[key] = withFallback(own as Messages, value as Messages);
    }
  }
  return merged;
}
const messages = withFallback(
  (locale === 'vi' ? viBundle : enBundle) as Messages,
  fallbackMessages[locale] as unknown as Messages
);

// Render counts for the performance adapter (React commit callbacks).
const profile = { commits: 0, actualDuration: 0 };
Object.assign(window, { __dashboardProfile: profile, __fixtureCalls: fixtureCalls, __fixtureUnexpected: unexpectedRequests });

/** Size-equivalent stand-in for the Mira panel (same height classes). */
function MiraBoundary() {
  return (
    <div
      data-dashboard-block="mira"
      data-fixture-stub="mira"
      className={`@container relative flex flex-col overflow-hidden ${MIRA_EMBEDDED_HEIGHT_CLASS}`}
    >
      <div className="flex min-h-0 flex-1 flex-col rounded-xl border bg-card/60 p-3">
        <div className="min-h-0 flex-1 overflow-y-auto text-muted-foreground text-sm">
          Mira
        </div>
        <label className="sr-only" htmlFor="fixture-composer">
          Ask Mira
        </label>
        <textarea
          id="fixture-composer"
          rows={2}
          placeholder="Ask Mira anything"
          className="w-full resize-none bg-transparent text-sm outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="ghost">
            Flash
          </Button>
          <Button type="button" size="sm" className="ml-auto">
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

function FinanceSlot() {
  if (state === 'loading') return <FinanceMonthCardSkeleton label="Loading" />;
  if (state === 'error') {
    return (
      <FinanceMonthCard
        state={{ status: 'error' }}
        financeHref="#finance"
        retry={<Button type="button" size="sm" variant="outline">Retry</Button>}
      />
    );
  }
  const long = params.get('names') !== 'short';
  return (
    <FinanceMonthCard
      financeHref="#finance"
      logHref="#finance/transactions?create=transaction"
      state={{
        status: 'ready',
        income: 18_200_000,
        expense: 12_480_000,
        currency: 'VND',
        locale,
        redacted: true,
        monthLabel: new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date()),
        timeZone: 'UTC',
        recent:
          state === 'empty'
            ? []
            : [
                { id: 'r1', label: long ? `Groceries and household supplies for the regional office kitchen` : 'Groceries', amount: -320_000, takenAt: new Date().toISOString() },
                { id: 'r2', label: 'Client payment', amount: 6_000_000, takenAt: new Date().toISOString() },
                { id: 'r3', label: null, amount: null, takenAt: new Date().toISOString() },
              ],
      }}
    />
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {sidebar !== 'none' ? (
        <aside
          data-fixture-sidebar
          aria-label="Fixture sidebar"
          className={`hidden shrink-0 border-r md:block ${sidebar === 'collapsed' ? 'w-16' : 'w-64'}`}
        />
      ) : null}
      <main data-slot="structure-content" className="min-w-0 flex-1 p-4">
        {children}
      </main>
      {sorbet ? (
        <nav data-slot="mobile-dock" aria-label="Fixture mobile dock" className="md:hidden">
          {['Home', 'Tasks', 'Calendar', 'More'].map((label) => (
            <button key={label} type="button" className="flex-1 text-xs">
              {label}
            </button>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

function Dashboard() {
  const links = {
    tasksHref: '#tasks',
    newTaskHref: '#tasks/new',
    calendarHref: '#calendar',
    trackHref: '#track',
  };
  return (
    <WorkspaceDashboardLayout
      label="Workspace overview"
      railLabel="Today at a glance"
      dock={<MiraBoundary />}
      main={
        <>
          <NextUpCard wsId="fixture-ws" isPersonal={false} showEvent showTask showTime calendarHref={links.calendarHref} />
          <MyTasksCard wsId="fixture-ws" isPersonal={false} tasksHref={links.tasksHref} newTaskHref={links.newTaskHref} />
          <TimeCard wsId="fixture-ws" trackHref={links.trackHref} />
        </>
      }
      rail={
        <>
          <TodayAgendaCard wsId="fixture-ws" calendarHref={links.calendarHref} />
          <FinanceSlot />
        </>
      }
    />
  );
}

function main() {
  if (MIRA_CLASS_SOURCE !== MIRA_EMBEDDED_HEIGHT_CLASS) {
    throw new Error('Fixture Mira size classes differ from MIRA_EMBEDDED_HEIGHT_CLASS');
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  createRoot(document.getElementById('root')!).render(
    <Profiler
      id="workspace-dashboard"
      onRender={(_id, _phase, actualDuration) => {
        profile.commits += 1;
        profile.actualDuration += actualDuration;
      }}
    >
      <NextIntlClientProvider locale={locale} messages={messages} timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}>
        <QueryClientProvider client={client}>
          <Shell>
            <Dashboard />
          </Shell>
        </QueryClientProvider>
      </NextIntlClientProvider>
    </Profiler>
  );
}

main();
