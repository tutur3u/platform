import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Button } from '@tuturuuu/ui/button';
import { NextIntlClientProvider } from 'next-intl';
import { useMemo, useState } from 'react';
import enMessages from '../../../../apps/meet/messages/en.json';
import viMessages from '../../../../apps/meet/messages/vi.json';
import { PersonalToolsPanel } from '../../src/features/call/components/personal-tools-panel';
import type { PersonalToolsApi } from '../../src/features/call/lib/personal-tools';

function createFixturePersonalToolsApi(): PersonalToolsApi {
  return {
    profile: async () => ({ id: 'fixture-actor' }) as never,
    workspaces: async () =>
      [
        {
          id: 'ws-personal',
          name: 'Personal',
          personal: true,
        },
      ] as never,
    tasks: async () =>
      ({
        overdue: [],
        today: [{ id: 'task-1', name: 'Prepare Q4 deck' }],
        upcoming: [{ id: 'task-2', name: 'Review launch checklist' }],
        totalActiveTasks: 2,
      }) as never,
    calendar: async () =>
      ({
        data: [
          {
            id: 'event-1',
            title: 'Product sync',
            start_at: '2026-11-28T09:00:00.000Z',
            end_at: '2026-11-28T09:30:00.000Z',
            is_encrypted: false,
          },
        ],
      }) as never,
    meetings: async () => ({
      meetings: [
        {
          id: 'meet-1',
          name: 'Weekly design review',
          time: '2026-11-28T14:00:00.000Z',
          created_at: '2026-11-27T10:00:00.000Z',
          creator_id: 'fixture-actor',
          calendar_event: null,
        },
      ],
      totalCount: 1,
    }),
    chat: async () =>
      [
        {
          id: 'conv-1',
          title: 'Design channel',
          type: 'channel',
          description: null,
          aiEnabled: false,
          archivedAt: null,
          createdAt: '2026-11-27T08:00:00.000Z',
          createdBy: 'fixture-actor',
          latestMessage: {
            id: 'msg-1',
            content: 'Updated mockups are ready',
          },
          memberCount: 4,
          members: [],
          metadata: {},
          unreadCount: 1,
          updatedAt: '2026-11-27T09:00:00.000Z',
          wsId: 'ws-personal',
        },
        {
          id: 'conv-2',
          title: 'Ops alerts',
          type: 'channel',
          description: null,
          aiEnabled: false,
          archivedAt: null,
          createdAt: '2026-11-27T07:00:00.000Z',
          createdBy: 'fixture-actor',
          latestMessage: {
            id: 'msg-2',
            content: 'All regions healthy',
          },
          memberCount: 3,
          members: [],
          metadata: {},
          unreadCount: 0,
          updatedAt: '2026-11-27T07:30:00.000Z',
          wsId: 'ws-personal',
        },
      ] as never,
    drive: async () => ({
      data: [
        {
          id: null,
          name: 'Roadmap',
          updated_at: '2026-11-27T08:00:00.000Z',
          metadata: null,
        },
        {
          id: 'file-1',
          name: 'Q4-budget.pdf',
          updated_at: '2026-11-27T09:30:00.000Z',
          metadata: { mimetype: 'application/pdf', size: 128000 },
        },
      ],
      pagination: { limit: 25, offset: 0, total: 2 },
    }),
  };
}

export function PrivateAppsFixtureScene({ locale }: { locale: 'en' | 'vi' }) {
  const [open, setOpen] = useState(false);
  const queryClient = useMemo(() => new QueryClient(), []);
  const api = useMemo(() => createFixturePersonalToolsApi(), []);
  const messages = locale === 'vi' ? viMessages : enMessages;

  return (
    <QueryClientProvider client={queryClient}>
      <NextIntlClientProvider
        locale={locale}
        messages={messages}
        timeZone="UTC"
      >
        <div className="flex h-screen w-screen bg-background text-foreground">
          <main className="flex flex-1 items-center justify-center p-6">
            <Button
              type="button"
              data-testid="open-private-apps"
              onClick={() => setOpen(true)}
            >
              {messages.meet.call.private_tools.title}
            </Button>
          </main>
          {open && (
            <PersonalToolsPanel
              accountId="fixture-actor"
              onClose={() => setOpen(false)}
              api={api}
            />
          )}
        </div>
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}
