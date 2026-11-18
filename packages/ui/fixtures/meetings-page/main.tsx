import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MeetingEntry } from '../../../meet-core/src/features/call/components/meeting-entry';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { NextIntlClientProvider } from 'next-intl';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import en from '../../../../apps/meet/messages/en.json';
import vi from '../../../../apps/meet/messages/vi.json';
import { MeetingsHome } from '../../../../apps/meet/src/app/[locale]/[wsId]/meetings/components/meetings-home';
import type {
  PastController,
  ScheduledMeeting,
} from '../../../../apps/meet/src/app/[locale]/[wsId]/meetings/components/types';
import './fixture.css';

const params = new URLSearchParams(location.search);
const locale = params.get('locale') === 'vi' ? 'vi' : 'en';
document.documentElement.classList.toggle(
  'dark',
  params.get('theme') === 'dark'
);
if (params.get('ui') === 'sorbet')
  document.documentElement.dataset.ui = 'sorbet';
const empty = params.get('state') === 'empty';
const open = params.get('past') !== 'closed';
const NOW = '2026-11-18T05:00:00.000Z';
const accountId = 'account-fixture';
const router = {
  back() {},
  forward() {},
  refresh() {},
  push() {},
  replace() {},
  prefetch: async () => {},
};

function meeting(i: number, iso: string, minutes?: number): ScheduledMeeting {
  const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
  return {
    id,
    name: i % 4 === 0 ? 'Weekly sync' : 'Untitled meeting',
    time: iso,
    createdAt: iso,
    creatorId: i % 3 === 0 ? 'someone-else' : accountId,
    calendar: minutes
      ? {
          id: `e${i}`,
          startAt: iso,
          endAt: new Date(Date.parse(iso) + minutes * 60_000).toISOString(),
        }
      : null,
  };
}
const past = [
  meeting(1, '2026-11-18T01:12:00.000Z'),
  meeting(2, '2026-11-17T12:31:00.000Z', 45),
  meeting(3, '2026-11-17T10:27:00.000Z'),
  meeting(4, '2026-11-17T09:09:00.000Z', 30),
  meeting(5, '2026-11-13T13:04:00.000Z'),
  meeting(6, '2026-11-13T10:31:00.000Z'),
  meeting(7, '2026-11-13T10:27:00.000Z', 75),
  meeting(8, '2026-11-12T16:49:00.000Z'),
  meeting(9, '2026-11-12T12:18:00.000Z'),
];
const upcoming = empty
  ? []
  : [
      meeting(20, '2026-11-18T09:00:00.000Z', 60),
      meeting(21, '2026-11-19T02:00:00.000Z', 30),
    ];

const client = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
for (const m of [...past, ...upcoming])
  client.setQueryData(['meet-room-state', m.id, accountId], {
    ended: past.includes(m),
    canReadNotes: true,
    lifecycleVersion: 1,
  });

function App() {
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const [search, setSearch] = useState('');
  const [choice, setChoice] = useState<'collapsed' | 'expanded'>(
    open ? 'expanded' : 'collapsed'
  );
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const shown = past;
  const controller: PastController = {
    choice,
    count: { loaded: shown.length, more: false },
    filter,
    onChoiceChange: setChoice,
    onFilterChange: setFilter,
    onLoadOlder() {},
    onRetry() {},
    onSearchChange: setSearch,
    results: { kind: 'ready', meetings: shown, older: { kind: 'complete' } },
    search,
  };
  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <h1 className="font-semibold text-2xl tracking-tight">Meetings</h1>
      <MeetingEntry
        canCreate
        onCreated={() => {}}
        onScheduleOpenChange={setScheduleOpen}
        scheduleOpen={scheduleOpen}
        wsId="ws"
      />
      <MeetingsHome
        accountId={accountId}
        management={{ onDelete() {}, onEdit() {} }}
        onRetry={() => {}}
        onSchedule={() => setScheduleOpen(true)}
        past={controller}
        state={{
          kind: 'ready',
          sync: 'fresh',
          schedule: {
            calendarAccess: { status: 'unavailable' },
            current: [],
            currentSource: 'unavailable',
            evaluatedAt: NOW,
            past,
            upcoming,
            viewerTimezone: {
              source: 'user-profile',
              timeZone: 'Asia/Ho_Chi_Minh',
            },
          },
        }}
        wsId="ws"
      />
    </div>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={client}>
    <AppRouterContext.Provider value={router as never}>
      <NextIntlClientProvider
        locale={locale}
        messages={locale === 'vi' ? (vi as never) : (en as never)}
      >
        <App />
      </NextIntlClientProvider>
    </AppRouterContext.Provider>
  </QueryClientProvider>
);
