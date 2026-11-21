import { Search } from '@tuturuuu/icons';
import { useI18n } from '../i18n';
import {
  LoadingRows,
  LoadMore,
  StaleLine,
  ThreadErrorMessage,
} from './list-states';
import { type StateFilter, threadErrorOf } from './model';
import { useThreadPages } from './queries';
import { ThreadRow } from './thread-row';

/**
 * Newest-first threads without grouping: a linked machine (which cannot
 * group by project) or a search. Rows name their project. A linked machine
 * answers each page in several seconds, so its loading row says so.
 */
export function FlatThreadList({
  environmentId,
  machineLabel,
  q,
  state,
  selected,
  now,
  onSelect,
}: {
  environmentId?: string;
  machineLabel: string;
  q?: string;
  state: StateFilter;
  selected?: string;
  now: number;
  onSelect: (threadId: string) => void;
}) {
  const { t } = useI18n();
  const pages = useThreadPages({ environmentId, q, state });
  const rows = pages.data?.pages.flatMap((page) => page.threads) ?? [];
  const code = threadErrorOf(pages.error);
  const slow = environmentId
    ? t('projects.loadingSlow', { machine: machineLabel })
    : undefined;

  if (pages.isPending) return <LoadingRows slowLabel={slow} />;
  if (!rows.length && code)
    return (
      <ThreadErrorMessage
        code={code}
        retrying={pages.isFetching}
        onRetry={() => void pages.refetch()}
      />
    );
  if (!rows.length && !pages.hasNextPage)
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <span className="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Search className="size-4" />
        </span>
        <p className="font-semibold">
          {q || state !== 'all' ? t('projects.empty') : t('projects.noThreads')}
        </p>
        {q ? (
          <p className="text-muted-foreground text-sm">
            {t('projects.emptyHint')}
          </p>
        ) : null}
      </div>
    );

  const total = pages.data?.pages[0]?.total;
  return (
    <div className="space-y-0.5">
      {code ? (
        <StaleLine code={code} updatedAt={pages.dataUpdatedAt} now={now} />
      ) : null}
      {rows.map((row) => (
        <ThreadRow
          key={row.threadId}
          row={row}
          subtitle={[
            row.project ?? t('projects.unassigned'),
            machineLabel,
          ].join(' · ')}
          selected={selected === row.threadId}
          now={now}
          nested={false}
          onSelect={() => onSelect(row.threadId)}
        />
      ))}
      {pages.isFetchingNextPage && slow ? (
        <LoadingRows slowLabel={slow} />
      ) : null}
      {pages.hasNextPage && !(pages.isFetchingNextPage && slow) ? (
        <LoadMore
          nested={false}
          remaining={
            state === 'all' && total !== undefined
              ? total - rows.length
              : undefined
          }
          loading={pages.isFetchingNextPage}
          onLoad={() => void pages.fetchNextPage()}
        />
      ) : null}
    </div>
  );
}
