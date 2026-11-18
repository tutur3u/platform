'use client';

import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { ToggleGroup, ToggleGroupItem } from '@tuturuuu/ui/toggle-group';
import { useEffect, useMemo, useState } from 'react';
import { useTaskDialog } from '../hooks/useTaskDialog';
import { FleetGroupSection } from './fleet-group-section';
import { FleetSummaryStrip } from './fleet-summary-strip';
import { parseFleetTaskMeta } from './fleet-task-meta';
import {
  type FleetGroupBy,
  type FleetItem,
  getFleetBucket,
  groupFleetItems,
  summarizeFleet,
} from './fleet-triage';
import { useFleetCopy } from './use-fleet-copy';

interface FleetBoardViewProps {
  boardId: string;
  workspaceId: string;
  isPersonalWorkspace: boolean;
  tasks: Task[];
  lists: TaskList[];
}

const GROUPS: FleetGroupBy[] = ['triage', 'product', 'priority', 'owner'];
const MINUTE = 60 * 1000;

/** Builds the parsed fleet items for a board's tasks. Exported for tests. */
export function buildFleetItems(
  tasks: Task[],
  lists: TaskList[]
): FleetItem<Task>[] {
  const statusByList = new Map(
    lists.map((list) => [list.id, list.status ?? null])
  );
  return tasks
    .filter((task) => !task.deleted_at)
    .map((task) => {
      const listStatus = statusByList.get(task.list_id) ?? null;
      return {
        task,
        listStatus,
        meta: parseFleetTaskMeta(task, { listStatus }),
      };
    });
}

/**
 * The Fleet view: what the agents are doing, what is stuck and what waits on
 * you. Read-only over the board's existing tasks (fleet:v1 card schema).
 */
export function FleetBoardView({
  boardId,
  workspaceId,
  isPersonalWorkspace,
  tasks,
  lists,
}: FleetBoardViewProps) {
  const copy = useFleetCopy();
  const { openTask } = useTaskDialog();
  const [groupBy, setGroupBy] = useState<FleetGroupBy>('triage');
  const [density, setDensity] = useState<'comfortable' | 'compact'>(
    'comfortable'
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), MINUTE);
    return () => window.clearInterval(timer);
  }, []);

  const items = useMemo(() => buildFleetItems(tasks, lists), [tasks, lists]);
  const summary = useMemo(() => summarizeFleet(items, now), [items, now]);
  const groups = useMemo(
    () => groupFleetItems(items, groupBy),
    [items, groupBy]
  );
  const liveBreakdown = useMemo(() => {
    const live = items.filter((item) => getFleetBucket(item) === 'live');
    return {
      running: live.filter((i) => i.meta.status === 'running').length,
      review: live.filter((i) => i.meta.status === 'waiting_review').length,
      ci: live.filter((i) => i.meta.status === 'waiting_ci').length,
    };
  }, [items]);

  const onOpen = (task: Task) =>
    openTask(task, boardId, lists, false, {
      taskWsId: workspaceId,
      taskWorkspacePersonal: isPersonalWorkspace,
    });

  return (
    <div className="h-full overflow-y-auto p-3 sm:p-4">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 pb-24">
        <FleetSummaryStrip
          copy={copy}
          liveBreakdown={liveBreakdown}
          summary={summary}
        />
        <div className="flex flex-wrap items-center gap-2.5">
          <ToggleGroup
            aria-label={copy.view.groupByLabel}
            onValueChange={(value) =>
              value && setGroupBy(value as FleetGroupBy)
            }
            size="sm"
            type="single"
            value={groupBy}
          >
            {GROUPS.map((g) => (
              <ToggleGroupItem key={g} value={g}>
                {copy.groupBy[g]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <span className="flex-1" />
          <span className="text-muted-foreground text-xs">
            {copy.view.hidden(summary.queued, summary.done)}
          </span>
          <ToggleGroup
            aria-label={copy.view.densityLabel}
            onValueChange={(value) =>
              value && setDensity(value as 'comfortable' | 'compact')
            }
            size="sm"
            type="single"
            value={density}
          >
            <ToggleGroupItem value="comfortable">
              {copy.view.comfortable}
            </ToggleGroupItem>
            <ToggleGroupItem value="compact">
              {copy.view.compact}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        {summary.open === 0 ? (
          <p className="rounded-2xl bg-muted/60 p-6 text-center text-muted-foreground text-sm">
            {copy.view.emptyFleet}
          </p>
        ) : (
          <div
            className={
              groupBy === 'triage'
                ? 'grid items-start gap-3.5 lg:grid-cols-3'
                : 'flex flex-col gap-3.5'
            }
          >
            {groups.map((group) => (
              <FleetGroupSection
                copy={copy}
                density={density}
                group={group}
                groupBy={groupBy}
                key={group.key || 'none'}
                now={now}
                onOpen={onOpen}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
