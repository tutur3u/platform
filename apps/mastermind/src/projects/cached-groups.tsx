import { Folder } from '@tuturuuu/icons';
import { useI18n } from '../i18n';
import { StaleLine } from './list-states';
import type { StateFilter } from './model';
import { type ListCache, useThreadPages } from './queries';
import { ThreadRow } from './thread-row';

/**
 * One project group with no snapshot: its first page, from the bridge or,
 * while the machine is away, from the browser cache with its age. The name
 * comes from the rows, so no project name is kept outside the sealed cache.
 */
function CachedGroup({
  projectId,
  store,
  state,
  selected,
  now,
  onSelect,
}: {
  projectId: string;
  store: ListCache;
  state: StateFilter;
  selected?: string;
  now: number;
  onSelect: (threadId: string) => void;
}) {
  const { t } = useI18n();
  const pages = useThreadPages({ projectId, state }, true, store);
  const first = pages.data?.pages[0];
  if (!first?.threads.length) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 px-2 py-1.5 font-semibold">
        <Folder className="size-3.5 text-muted-foreground" />
        <span className="truncate">
          {first.threads[0]?.project ?? t('projects.unassigned')}
        </span>
      </div>
      {first.cachedAt ? (
        <StaleLine
          code="machine_offline"
          updatedAt={Date.parse(first.cachedAt)}
          now={now}
        />
      ) : null}
      {first.threads.map((row) => (
        <ThreadRow
          key={row.threadId}
          row={row}
          selected={selected === row.threadId}
          now={now}
          nested
          onSelect={() => onSelect(row.threadId)}
        />
      ))}
    </div>
  );
}

/** The project groups this browser cached, shown when the snapshot cannot load. */
export function CachedGroups({
  projectIds,
  ...props
}: Omit<Parameters<typeof CachedGroup>[0], 'projectId'> & {
  projectIds: string[];
}) {
  return (
    <div className="space-y-0.5">
      {projectIds.map((projectId) => (
        <CachedGroup key={projectId} projectId={projectId} {...props} />
      ))}
    </div>
  );
}
