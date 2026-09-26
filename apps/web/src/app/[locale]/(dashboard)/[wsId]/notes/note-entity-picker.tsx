'use client';

import { useQuery } from '@tanstack/react-query';
import { Link2, Search } from '@tuturuuu/icons';
import { listWorkspaceCalendarEvents } from '@tuturuuu/internal-api/calendar';
import { getWorkspaceMeetings } from '@tuturuuu/internal-api/meetings';
import { listWorkspaceTasks } from '@tuturuuu/internal-api/tasks';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { getCalendarAppOrigin } from '@/lib/calendar-app-url';
import { getMeetAppOrigin } from '@/lib/meet-app-url';
import { getTasksAppUrlClient } from '@/lib/tasks-app-url-client';

type LinkKind = 'tasks' | 'events' | 'meetings';
type LinkOption = { id: string; label: string; href: string };

export function NoteEntityPicker({
  wsId,
  onSelect,
}: {
  wsId: string;
  onSelect: (option: LinkOption) => void;
}) {
  const t = useTranslations('notes_app');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<LinkKind>('tasks');
  const [search, setSearch] = useState('');
  const calendarRange = useMemo(() => {
    const now = Date.now();
    return {
      start_at: new Date(now - 30 * 86400000).toISOString(),
      end_at: new Date(now + 180 * 86400000).toISOString(),
    };
  }, []);

  const tasks = useQuery({
    queryKey: ['notes', wsId, 'link-tasks', search],
    queryFn: () => listWorkspaceTasks(wsId, { q: search, limit: 30 }),
    enabled: open && kind === 'tasks',
  });
  const events = useQuery({
    queryKey: ['notes', wsId, 'link-events', calendarRange],
    queryFn: () => listWorkspaceCalendarEvents(wsId, calendarRange),
    enabled: open && kind === 'events',
  });
  const meetings = useQuery({
    queryKey: ['notes', wsId, 'link-meetings', search],
    queryFn: () =>
      getWorkspaceMeetings<{
        meetings: { id: string; name: string }[];
      }>(wsId, { page: 1, pageSize: 30, search }),
    enabled: open && kind === 'meetings',
  });

  const options: LinkOption[] =
    kind === 'tasks'
      ? (tasks.data?.tasks ?? []).map((task) => ({
          id: task.id,
          label: task.name,
          href: getTasksAppUrlClient(`/${locale}/${wsId}/tasks/${task.id}`),
        }))
      : kind === 'events'
        ? (events.data?.data ?? [])
            .filter((event) =>
              (event.title ?? '').toLowerCase().includes(search.toLowerCase())
            )
            .slice(0, 30)
            .map((event) => ({
              id: event.id,
              label: event.title || t('untitled'),
              href: `${getCalendarAppOrigin()}/${locale}/${wsId}?eventId=${encodeURIComponent(event.id)}`,
            }))
        : (meetings.data?.meetings ?? []).map((meeting) => ({
            id: meeting.id,
            label: meeting.name,
            href: `${getMeetAppOrigin()}/${locale}/${wsId}/meetings/${meeting.id}`,
          }));
  const activeQuery =
    kind === 'tasks' ? tasks : kind === 'events' ? events : meetings;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" type="button">
          <Link2 className="mr-2 size-4" />
          {t('link_work')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('link_work')}</DialogTitle>
        </DialogHeader>
        <fieldset className="flex flex-wrap gap-2" aria-label={t('link_work')}>
          {(['tasks', 'events', 'meetings'] as const).map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={kind === value ? 'default' : 'outline'}
              onClick={() => {
                setKind(value);
                setSearch('');
              }}
            >
              {t(`link_${value}`)}
            </Button>
          ))}
        </fieldset>
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('search_work')}
            className="pl-9"
          />
        </div>
        <div className="max-h-72 min-h-20 space-y-1 overflow-y-auto">
          {activeQuery.isPending ? (
            <p className="p-3 text-muted-foreground text-sm">{t('loading')}</p>
          ) : activeQuery.isError ? (
            <p className="p-3 text-destructive text-sm">{t('load_error')}</p>
          ) : options.length === 0 ? (
            <p className="p-3 text-muted-foreground text-sm">
              {t('no_link_results')}
            </p>
          ) : (
            options.map((option) => (
              <button
                key={option.id}
                type="button"
                className="block w-full truncate rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onSelect(option);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
