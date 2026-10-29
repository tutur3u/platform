'use client';

import { ListFilter, Search } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { CycleFilterMenu } from './cycle-filter-menu';
import type { collectFilterOptions } from './cycle-planning-model';
import { hasActiveFilters } from './cycle-planning-model';
import {
  ASSIGNEE_ME,
  ASSIGNEE_UNASSIGNED,
  type CyclePlanningFilters,
  type CycleTaskPriority,
  EMPTY_CYCLE_PLANNING_FILTERS,
  PROJECT_NONE,
} from './types';

const PRIORITIES: CycleTaskPriority[] = ['critical', 'high', 'normal', 'low'];

interface CyclePlanningFiltersBarProps {
  filters: CyclePlanningFilters;
  onChange: (filters: CyclePlanningFilters) => void;
  options: ReturnType<typeof collectFilterOptions>;
}

/** Assignee, then Project, then search; everything else sits under More. */
export function CyclePlanningFiltersBar({
  filters,
  onChange,
  options,
}: CyclePlanningFiltersBarProps) {
  const t = useTranslations('task-cycle-planning');
  const set = <K extends keyof CyclePlanningFilters>(
    key: K,
    value: CyclePlanningFilters[K]
  ) => onChange({ ...filters, [key]: value });

  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
      <CycleFilterMenu
        label={t('assignee')}
        sections={[
          {
            key: 'self',
            options: [
              { id: ASSIGNEE_ME, label: t('assignee_me') },
              { id: ASSIGNEE_UNASSIGNED, label: t('unassigned') },
            ],
            selected: filters.assigneeIds,
            onChange: (ids) => set('assigneeIds', ids),
          },
          {
            key: 'people',
            options: options.people.map((person) => ({
              id: person.id,
              label: person.display_name ?? person.id,
            })),
            selected: filters.assigneeIds,
            onChange: (ids) => set('assigneeIds', ids),
          },
        ]}
      />
      <CycleFilterMenu
        label={t('project')}
        sections={[
          {
            key: 'projects',
            options: [
              ...options.projects.map(({ id, name }) => ({ id, label: name })),
              { id: PROJECT_NONE, label: t('no_project') },
            ],
            selected: filters.projectIds,
            onChange: (ids) => set('projectIds', ids),
          },
        ]}
      />
      <div className="relative w-44">
        <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.query}
          onChange={(event) => set('query', event.target.value)}
          placeholder={t('search_placeholder')}
          aria-label={t('search_placeholder')}
          className="h-8 pl-7 text-sm"
        />
      </div>
      <CycleFilterMenu
        label={t('more')}
        icon={<ListFilter className="size-3.5" />}
        sections={[
          {
            key: 'priority',
            label: t('priority'),
            options: PRIORITIES.map((id) => ({
              id,
              label: t(`priority_${id}`),
            })),
            selected: filters.priorities,
            onChange: (ids) => set('priorities', ids as CycleTaskPriority[]),
          },
          {
            key: 'labels',
            label: t('labels'),
            options: options.labels.map(({ id, name }) => ({
              id,
              label: name,
            })),
            selected: filters.labelIds,
            onChange: (ids) => set('labelIds', ids),
          },
        ]}
      />
      {hasActiveFilters(filters) && (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-muted-foreground"
          onClick={() => onChange(EMPTY_CYCLE_PLANNING_FILTERS)}
        >
          {t('clear_filters')}
        </Button>
      )}
    </div>
  );
}
