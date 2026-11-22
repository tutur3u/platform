import { useQueryClient } from '@tanstack/react-query';
import { MessageSquare } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { type ReactNode, useEffect } from 'react';
import { PageHeader, Preferences, Shell } from '../components/shell';
import { useNow } from '../fleet/clock';
import { subscribeOwnerLive } from '../fleet/owner-live';
import { formatAge, useI18n } from '../i18n';
import type { ProjectsSearch } from '../routes/{-$locale}/projects';
import { FlatThreadList } from './flat-list';
import { CachedGroups } from './cached-groups';
import { useListCache } from './list-cache';
import { LoadingRows, ThreadErrorMessage } from './list-states';
import { ListTools } from './list-tools';
import { filterCounts } from './model';
import { ProjectAccordion } from './project-accordion';
import { THREADS_QUERY_ROOT, useProjects } from './queries';
import { ThreadPane } from './thread-pane';

/**
 * Every T3 thread on every linked machine. This machine groups by project;
 * a linked machine, or a search, lists threads flat. Selection, machine,
 * search and state live in the URL, so Back closes an opened thread.
 */
export function ProjectsPage({
  search,
  onSearch,
}: {
  search: ProjectsSearch;
  onSearch: (next: Partial<ProjectsSearch>, replace?: boolean) => void;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  useEffect(
    () =>
      subscribeOwnerLive((frame) => {
        if (frame.t === 'poke' && frame.poke.topic === 'threads')
          void queryClient.invalidateQueries({ queryKey: THREADS_QUERY_ROOT });
      }),
    [queryClient]
  );

  const now = useNow(Date.now());
  const { machines, context, denied, store, cachedProjects } = useListCache();
  const linked = search.machine !== undefined;
  const projects = useProjects(!linked && !denied);
  const list = context?.machines ?? [];
  const machine = list.find(
    (m) => (m.environmentId ?? undefined) === search.machine
  );
  const machineLabel = machine?.label ?? list[0]?.label ?? '';
  const state = search.state ?? 'all';
  const refreshing = machines.isFetching || projects.isFetching;
  const select = (thread: string) => onSearch({ thread }, false);
  const readAt = projects.dataUpdatedAt || machines.dataUpdatedAt;

  let body: ReactNode;
  // Without the grouping route (404), or with no snapshot while the machine
  // is away, this machine lists flat or shows the groups this browser cached.
  const ungrouped = !projects.data && projects.isError;
  if (machines.isPending) {
    // Lists wait for the machine context, which keys their browser cache.
    body = <LoadingRows />;
  } else if (denied) {
    body = (
      <ThreadErrorMessage
        code="denied"
        retrying={machines.isFetching}
        onRetry={() => void machines.refetch()}
      />
    );
  } else if (
    ungrouped &&
    !linked &&
    !search.q &&
    store &&
    cachedProjects.length
  ) {
    body = (
      <CachedGroups
        projectIds={cachedProjects}
        store={store}
        state={state}
        selected={search.thread}
        now={now}
        onSelect={select}
      />
    );
  } else if (linked || search.q || ungrouped) {
    body = (
      <FlatThreadList
        store={store}
        environmentId={search.machine}
        machineLabel={machineLabel}
        q={search.q}
        state={state}
        selected={search.thread}
        now={now}
        onSelect={select}
      />
    );
  } else if (projects.data) {
    body = (
      <ProjectAccordion
        store={store}
        snapshot={projects.data}
        updatedAt={projects.dataUpdatedAt}
        error={projects.error}
        state={state}
        selected={search.thread}
        now={now}
        onSelect={select}
      />
    );
  } else {
    body = <LoadingRows />;
  }

  return (
    <Shell footer={null}>
      <PageHeader
        title={t('projects.title')}
        subtitle={t('projects.subtitle')}
        actions={
          <div className="flex flex-col items-end gap-2">
            {readAt ? (
              <span className="text-muted-foreground text-xs">
                {t('projects.read', {
                  machines: list.length,
                  age: formatAge(t, now - readAt),
                })}
              </span>
            ) : null}
            <Preferences />
          </div>
        }
      />
      <div className="grid min-h-[34rem] overflow-hidden rounded-xl border bg-card shadow-sm lg:grid-cols-[22rem_minmax(0,1fr)]">
        <section
          aria-label={t('projects.allThreads')}
          className={cn(
            'flex min-w-0 flex-col lg:border-r',
            search.thread && 'max-lg:hidden'
          )}
        >
          <ListTools
            q={search.q}
            state={state}
            counts={
              !linked && !search.q && projects.data
                ? filterCounts(projects.data)
                : undefined
            }
            machines={list}
            machine={search.machine}
            refreshing={refreshing}
            onQuery={(q) => onSearch({ q })}
            onState={(next) =>
              onSearch({ state: next === 'all' ? undefined : next })
            }
            onMachine={(environmentId) =>
              onSearch({ machine: environmentId, thread: undefined })
            }
            onRefresh={() =>
              void queryClient.invalidateQueries({
                queryKey: THREADS_QUERY_ROOT,
              })
            }
          />
          <div className="p-1.5">{body}</div>
        </section>
        {search.thread && context ? (
          <ThreadPane
            ownerId={context.ownerId}
            machineId={context.machineId}
            key={`${search.machine ?? ''}:${search.thread}`}
            environmentId={search.machine}
            threadId={search.thread}
            machineLabel={machineLabel}
            now={now}
            onClose={() => onSearch({ thread: undefined })}
          />
        ) : (
          <div className="hidden flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground lg:flex">
            <MessageSquare className="size-5" />
            <p className="text-sm">{t('projects.select')}</p>
          </div>
        )}
      </div>
    </Shell>
  );
}
