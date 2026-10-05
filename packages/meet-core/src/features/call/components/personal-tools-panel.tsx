'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckSquare,
  ExternalLink,
  LockKeyhole,
  X,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import {
  getLaunchableApp,
  resolveLaunchableAppUrl,
} from '@tuturuuu/utils/launchable-apps';
import { useFormatter, useTranslations } from 'next-intl';
import {
  loadPersonalTools,
  type PersonalToolsSnapshot,
  personalToolsApi,
  personalToolsFailureKeepsSnapshot,
} from '../lib/personal-tools';
import { ControlButton } from './control-bar';
import { ResizableCallPanel } from './resizable-call-panel';

export function PersonalToolsPanel({
  accountId,
  onClose,
}: {
  accountId: string;
  onClose: () => void;
}) {
  const t = useTranslations('meet.call.private_tools');
  const format = useFormatter();
  const cache = useQueryClient();
  const key = ['meet-personal-tools', accountId];
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      loadPersonalTools(
        accountId,
        personalToolsApi,
        new Date(),
        cache.getQueryData<PersonalToolsSnapshot>(key)
      ),
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
  const data =
    query.isError && !personalToolsFailureKeepsSnapshot(query.error)
      ? null
      : query.data;
  const tasks = data?.tasks
    ? [...data.tasks.overdue, ...data.tasks.today, ...data.tasks.upcoming]
    : null;
  const openApp = (slug: 'tasks' | 'calendar') =>
    resolveLaunchableAppUrl({
      app: getLaunchableApp(slug)!,
      workspace: data?.workspace,
    });
  return (
    <ResizableCallPanel label={t('title')}>
      <header className="flex items-center justify-between px-4 py-3">
        <div>
          <h2 className="font-medium text-sm">{t('title')}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-muted-foreground text-xs">
            <LockKeyhole className="size-3" />
            {t('private')}
          </p>
        </div>
        <ControlButton icon={X} label={t('close')} onClick={onClose} />
      </header>
      {query.isPending ? (
        <p role="status" className="p-4 text-muted-foreground text-sm">
          {t('loading')}
        </p>
      ) : !data ? (
        <p role="status" className="p-4 text-muted-foreground text-sm">
          {t('unavailable')}
        </p>
      ) : (
        <Tabs
          defaultValue="tasks"
          className="flex min-h-0 flex-1 flex-col px-4 pb-4"
        >
          <TabsList className="grid grid-cols-2">
            <TabsTrigger value="tasks">
              <CheckSquare className="mr-1.5 size-4" />
              {t('tasks')}
            </TabsTrigger>
            <TabsTrigger value="calendar">
              <CalendarDays className="mr-1.5 size-4" />
              {t('calendar')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="tasks" className="min-h-0 overflow-auto">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="my-2 w-full justify-between"
            >
              <a
                href={openApp('tasks')}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('open_tasks')}
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
            {data.tasksStatus === 'stale' && (
              <p role="status" className="mb-2 text-muted-foreground text-xs">
                {t('stale_tasks')}
              </p>
            )}
            {!tasks ? (
              <p className="text-muted-foreground text-sm">
                {t('unavailable')}
              </p>
            ) : !tasks.length ? (
              <p className="text-muted-foreground text-sm">
                {t('empty_tasks')}
              </p>
            ) : (
              <ul className="space-y-1">
                {tasks.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-start gap-2 rounded-lg px-2 py-3"
                  >
                    <CheckSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="break-words text-sm">{task.name}</span>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="calendar" className="min-h-0 overflow-auto">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="my-2 w-full justify-between"
            >
              <a
                href={openApp('calendar')}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('open_calendar')}
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
            {data.calendarStatus === 'stale' && (
              <p role="status" className="mb-2 text-muted-foreground text-xs">
                {t('stale_calendar')}
              </p>
            )}
            {!data.events ? (
              <p className="text-muted-foreground text-sm">
                {t('unavailable')}
              </p>
            ) : !data.events.length ? (
              <p className="text-muted-foreground text-sm">
                {t('empty_calendar')}
              </p>
            ) : (
              <ul className="space-y-1">
                {data.events.map((event) => (
                  <li key={event.id} className="rounded-lg px-2 py-3">
                    <p className="break-words text-sm">
                      {event.is_encrypted
                        ? t('protected_event')
                        : event.title || t('event')}
                    </p>
                    <p className="mt-1 text-muted-foreground text-xs">
                      {format.dateTime(new Date(event.start_at), {
                        weekday: 'short',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      )}
    </ResizableCallPanel>
  );
}
