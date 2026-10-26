'use client';

import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type ReactNode, useMemo, useState } from 'react';
import { CycleEmptyLine } from './cycle-empty-line';
import {
  type CyclePlanningDataSource,
  internalApiCyclePlanningSource,
} from './cycle-planning-api';
import { CyclePlanningFiltersBar } from './cycle-planning-filters';
import {
  type CycleGroupStatus,
  collectFilterOptions,
  DEFAULT_COLLAPSED_STATUSES,
  filterCycleTasks,
  groupTasksByStatus,
  hasActiveFilters,
  resolveScopeCycles,
  scopeCycleId,
} from './cycle-planning-model';
import { CYCLE_SCOPES, CycleScopeSwitcher } from './cycle-scope-switcher';
import { CycleStatusGroupSection } from './cycle-status-group';
import { CycleTaskRow } from './cycle-task-row';
import {
  type CyclePlanningCycle,
  type CyclePlanningScope,
  type CyclePlanningTask,
  EMPTY_CYCLE_PLANNING_FILTERS,
} from './types';
import { useCyclePlanning } from './use-cycle-planning';

interface CyclePlanningViewProps {
  wsId: string;
  currentUserId: string;
  cycles: CyclePlanningCycle[];
  source?: CyclePlanningDataSource;
}

/** Status-grouped task list for the current cycle, the next one, or the backlog. */
export function CyclePlanningView({
  wsId,
  currentUserId,
  cycles,
  source = internalApiCyclePlanningSource,
}: CyclePlanningViewProps) {
  const t = useTranslations('task-cycle-planning');
  const scopeCycles = useMemo(() => resolveScopeCycles(cycles), [cycles]);
  const [scope, setScope] = useState<CyclePlanningScope>(
    scopeCycles.current ? 'current' : 'backlog'
  );
  const [filters, setFilters] = useState(EMPTY_CYCLE_PLANNING_FILTERS);
  const [collapsed, setCollapsed] = useState<ReadonlySet<CycleGroupStatus>>(
    () => new Set(DEFAULT_COLLAPSED_STATUSES)
  );

  const cycleId = scopeCycleId(scope, scopeCycles);
  const missingCycle = scope !== 'backlog' && !cycleId;
  const { tasksQuery, moveTask } = useCyclePlanning({
    wsId,
    cycleId,
    enabled: !missingCycle,
    source,
    onMoveError: () => toast.error(t('move_failed')),
  });

  const tasks = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const groups = useMemo(
    () => groupTasksByStatus(filterCycleTasks(tasks, filters, currentUserId)),
    [tasks, filters, currentUserId]
  );
  const options = useMemo(
    () => collectFilterOptions(tasks, currentUserId),
    [tasks, currentUserId]
  );
  const reachable = CYCLE_SCOPES.filter(
    (value) => value === 'backlog' || scopeCycles[value]
  );
  const moveTargets = reachable.filter((value) => value !== scope);

  const move = (task: CyclePlanningTask, target: CyclePlanningScope) =>
    moveTask({
      task,
      fromCycleId: cycleId,
      toCycleId: scopeCycleId(target, scopeCycles),
    });

  const toggleGroup = (status: CycleGroupStatus) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(status)) next.add(status);
      return next;
    });

  const cyclesHref = `/${wsId}/cycles`;
  let body: ReactNode;
  if (missingCycle) {
    body = (
      <CycleEmptyLine
        text={t('empty_no_cycle')}
        actionLabel={t('manage_cycles')}
        href={cyclesHref}
      />
    );
  } else if (tasksQuery.isError) {
    body = (
      <CycleEmptyLine
        text={t('load_failed')}
        actionLabel={t('retry')}
        onAction={() => tasksQuery.refetch()}
      />
    );
  } else if (tasksQuery.isPending) {
    body = (
      <div aria-busy className="space-y-1 px-2 py-2">
        {[0, 1, 2, 3].map((key) => (
          <div key={key} className="h-6 animate-pulse rounded bg-muted/60" />
        ))}
      </div>
    );
  } else if (groups.length === 0) {
    body = hasActiveFilters(filters) ? (
      <CycleEmptyLine
        text={t('empty_filtered')}
        actionLabel={t('clear_filters')}
        onAction={() => setFilters(EMPTY_CYCLE_PLANNING_FILTERS)}
      />
    ) : scope === 'backlog' ? (
      <CycleEmptyLine
        text={t('empty_backlog')}
        actionLabel={t('manage_cycles')}
        href={cyclesHref}
      />
    ) : (
      <CycleEmptyLine
        text={t('empty_cycle')}
        actionLabel={t('open_backlog')}
        onAction={() => setScope('backlog')}
      />
    );
  } else {
    body = (
      <div data-cycle-list className="space-y-1">
        {groups.map((group) => (
          <CycleStatusGroupSection
            key={group.status}
            group={group}
            collapsed={collapsed.has(group.status)}
            onToggle={() => toggleGroup(group.status)}
          >
            {group.tasks.map((task) => (
              <CycleTaskRow
                key={task.id}
                task={task}
                href={`/${wsId}/tasks/${task.id}`}
                moveTargets={moveTargets}
                onMove={move}
              />
            ))}
          </CycleStatusGroupSection>
        ))}
      </div>
    );
  }

  const scopeCycle = scope === 'backlog' ? null : scopeCycles[scope];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <CycleScopeSwitcher
          scope={scope}
          onScopeChange={setScope}
          dropTargets={reachable}
          onTaskDrop={(target, taskId) => {
            const task = tasks.find((item) => item.id === taskId);
            if (task) move(task, target);
          }}
        />
        {scopeCycle && (
          <span className="truncate text-muted-foreground text-sm">
            {scopeCycle.name}
          </span>
        )}
      </div>
      <CyclePlanningFiltersBar
        filters={filters}
        onChange={setFilters}
        options={options}
      />
      {body}
    </div>
  );
}
