/// <reference types="vite/client" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CalendarHeaderActions } from '@tasks-ui/calendar/components/calendar-header-actions';
import { CalendarSyncProvider } from '@tuturuuu/ui/hooks/use-calendar-sync';
import type { CalendarView } from '@tuturuuu/ui/hooks/use-view-transition';
import { CalendarContent } from '@tuturuuu/ui/legacy/calendar/calendar-content';
import { CalendarSettingsProvider } from '@tuturuuu/ui/legacy/calendar/settings/settings-context';
import { TooltipProvider } from '@tuturuuu/ui/tooltip';
import { IntlProvider, useTranslations } from 'next-intl';
import { useState } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import messages from '../../../../apps/calendar/messages/en.json';
import './style.css';

/**
 * Mounts the real CalendarContent (header, weekday bar, loading skeletons and
 * time grid) the way the Calendar app does: a controlled view that starts at
 * "week", inside a fixed-height page. Data hooks, dialogs and auth are static
 * fixtures (see fixtures.tsx), so the page needs no server.
 *
 * The tree is first rendered to HTML and painted, as a server response would
 * be, and then hydrated. `?hold=1` keeps the server markup without hydrating,
 * which is what the browser shows before the client bundle runs.
 */
const params = new URLSearchParams(location.search);
if (params.get('theme') === 'dark')
  document.documentElement.classList.add('dark');

/** Stand-in for the time the client bundle takes to load and hydrate. */
const HYDRATE_DELAY_MS = 250;
const FIXTURE_DATE = new Date(2026, 10, 18);
const isMobile = window.innerWidth < 768;
const queryClient = new QueryClient();

function Calendar() {
  const t = useTranslations('calendar');
  const [date, setDate] = useState(FIXTURE_DATE);
  const [view, setView] = useState<CalendarView>('week');
  const availableViews = [
    { label: t('day'), value: 'day' },
    { disabled: isMobile, label: t('4-days'), value: '4-days' },
    { disabled: isMobile, label: t('week'), value: 'week' },
    { label: t('month'), value: 'month' },
    { label: t('year'), value: 'year' },
    { label: t('agenda'), value: 'agenda' },
  ];
  return (
    <CalendarContent
      t={t}
      locale="en"
      externalState={{ date, setDate, view, setView, availableViews }}
      extras={
        <CalendarHeaderActions workspaceId="fixture-ws" enableSmartScheduling />
      }
    />
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <IntlProvider
        locale="en"
        messages={messages}
        timeZone="Asia/Ho_Chi_Minh"
        now={FIXTURE_DATE}
      >
        <TooltipProvider>
          <CalendarSyncProvider>
            <CalendarSettingsProvider
              initialSettings={{
                timezone: { timezone: 'Asia/Ho_Chi_Minh' },
              }}
            >
              <div className="flex h-dvh flex-col bg-background p-4">
                <div
                  className="min-h-0 w-full flex-1 overflow-hidden"
                  data-testid="calendar-root"
                >
                  <Calendar />
                </div>
              </div>
            </CalendarSettingsProvider>
          </CalendarSyncProvider>
        </TooltipProvider>
      </IntlProvider>
    </QueryClientProvider>
  );
}

const root = document.getElementById('root') as HTMLElement;
root.innerHTML = renderToString(<App />);
performance.mark('calendar-server-markup');
if (params.get('hold') !== '1') {
  requestAnimationFrame(() =>
    window.setTimeout(() => {
      performance.mark('calendar-hydrate');
      hydrateRoot(root, <App />);
    }, HYDRATE_DELAY_MS)
  );
}
