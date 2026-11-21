import { ChevronDown, Folder } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import { useI18n } from '../i18n';
import type { ProjectsSnapshot } from './contract';
import {
  ThreadErrorMessage,
  LoadingRows,
  LoadMore,
  StaleLine,
} from './list-states';
import {
  type GroupView,
  type StateFilter,
  threadErrorOf,
  visibleGroups,
} from './model';
import { type ListCache, useThreadPages } from './queries';
import { StateCountsLine, ThreadRow } from './thread-row';

interface ListProps {
  store?: ListCache;
  state: StateFilter;
  selected?: string;
  now: number;
  onSelect: (threadId: string) => void;
}

/** An open group pages its own threads, newest first, 50 at a time. */
function GroupThreads({ group, ...props }: ListProps & { group: GroupView }) {
  const pages = useThreadPages(
    { projectId: group.id, state: props.state },
    true,
    props.store
  );
  const rows = pages.data?.pages.flatMap((page) => page.threads) ?? [];
  const code = threadErrorOf(pages.error);
  if (pages.isPending) return <LoadingRows />;
  if (!rows.length && code)
    return (
      <ThreadErrorMessage
        code={code}
        retrying={pages.isFetching}
        onRetry={() => void pages.refetch()}
      />
    );
  const cachedAt = pages.data?.pages[0]?.cachedAt;
  const shown =
    props.state === 'all' ? group.threadCount : group.counts[props.state];
  return (
    <>
      {cachedAt ? (
        <StaleLine
          code="machine_offline"
          updatedAt={Date.parse(cachedAt)}
          now={props.now}
        />
      ) : null}
      {rows.map((row) => (
        <ThreadRow
          key={row.threadId}
          row={row}
          selected={props.selected === row.threadId}
          now={props.now}
          nested
          onSelect={() => props.onSelect(row.threadId)}
        />
      ))}
      {pages.hasNextPage ? (
        <LoadMore
          nested
          remaining={shown - rows.length}
          loading={pages.isFetchingNextPage}
          onLoad={() => void pages.fetchNextPage()}
        />
      ) : null}
    </>
  );
}

/**
 * The bridge machine's threads grouped by project, as in the T3 Code
 * sidebar. Headers come from one snapshot; a group reads its threads only
 * while it is open. The first group starts open.
 */
export function ProjectAccordion({
  snapshot,
  updatedAt,
  error,
  ...props
}: ListProps & {
  snapshot: ProjectsSnapshot;
  updatedAt: number;
  error: unknown;
}) {
  const { t } = useI18n();
  const groups = visibleGroups(snapshot, props.state);
  // The first group starts open; later filters never reopen or close one.
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () => new Set(groups[0] ? [groups[0].id] : [])
  );
  const code = threadErrorOf(error);

  return (
    <div className="space-y-0.5">
      {code ? (
        <StaleLine code={code} updatedAt={updatedAt} now={props.now} />
      ) : null}
      {groups.length === 0 ? (
        <p className="px-2 py-8 text-center text-muted-foreground text-sm">
          {props.state === 'all'
            ? t('projects.noThreads')
            : t('projects.empty')}
        </p>
      ) : null}
      {groups.map((group) => {
        const expanded = open.has(group.id);
        return (
          <div key={group.id}>
            <button
              type="button"
              aria-expanded={expanded}
              onClick={() =>
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (!next.delete(group.id)) next.add(group.id);
                  return next;
                })
              }
              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left font-semibold hover:bg-accent focus-visible:outline-1 focus-visible:outline-ring/50"
            >
              <ChevronDown
                className={cn(
                  'size-3.5 text-muted-foreground transition-transform',
                  !expanded && '-rotate-90'
                )}
              />
              <Folder className="size-3.5 text-muted-foreground" />
              <span className="truncate">
                {group.label ?? t('projects.unassigned')}
              </span>
              <StateCountsLine counts={group.counts} />
            </button>
            {expanded ? <GroupThreads group={group} {...props} /> : null}
          </div>
        );
      })}
    </div>
  );
}
