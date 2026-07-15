'use client';

import { Grid3x3, List, Plus, Search, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type {
  ProjectOperationsStats,
  SortBy,
  SortOrder,
  ViewMode,
} from '../types';
import { ProjectFilterMenu } from './project-filter-menu';
import { ProjectMetrics } from './project-metrics';
import { ProjectSortMenu } from './project-sort-menu';

interface ProjectsToolbarProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  sortBy: SortBy;
  setSortBy: (sort: SortBy) => void;
  sortOrder: SortOrder;
  setSortOrder: (order: SortOrder) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  statusFilter: string[];
  setStatusFilter: Dispatch<SetStateAction<string[]>>;
  priorityFilter: string[];
  setPriorityFilter: Dispatch<SetStateAction<string[]>>;
  healthFilter: string[];
  setHealthFilter: Dispatch<SetStateAction<string[]>>;
  hasActiveFilters: boolean;
  clearFilters: () => void;
  projectCount: number;
  filteredCount: number;
  stats: ProjectOperationsStats;
  onCreateClick: () => void;
}

export function ProjectsToolbar({
  viewMode,
  setViewMode,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  searchQuery,
  setSearchQuery,
  statusFilter,
  setStatusFilter,
  priorityFilter,
  setPriorityFilter,
  healthFilter,
  setHealthFilter,
  hasActiveFilters,
  clearFilters,
  projectCount,
  filteredCount,
  stats,
  onCreateClick,
}: ProjectsToolbarProps) {
  const t = useTranslations('task-projects');

  return (
    <section className="space-y-4 rounded-lg border border-dynamic-surface/60 bg-dynamic-surface/10 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <p className="font-medium text-muted-foreground text-xs">
            {t('toolbar.command_center')}
          </p>
          <h2 className="font-semibold text-xl">{t('toolbar.all_projects')}</h2>
          <p className="text-muted-foreground text-sm">
            {projectCount === 1
              ? t('toolbar.project_count', {
                  count: filteredCount,
                  total: projectCount,
                })
              : t('toolbar.project_count_plural', {
                  count: filteredCount,
                  total: projectCount,
                })}
          </p>
        </div>
        <Button onClick={onCreateClick} className="w-full gap-2 lg:w-auto">
          <Plus className="h-4 w-4" />
          {t('toolbar.new_project')}
        </Button>
      </div>

      <ProjectMetrics stats={stats} />

      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('toolbar.search_placeholder')}
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-10 rounded-md pr-10 pl-9"
          />
          {searchQuery ? (
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-1/2 right-1 h-8 w-8 -translate-y-1/2"
              onClick={() => setSearchQuery('')}
              aria-label={t('toolbar.clear_search')}
            >
              <X className="h-4 w-4" />
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ProjectFilterMenu
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            priorityFilter={priorityFilter}
            setPriorityFilter={setPriorityFilter}
            healthFilter={healthFilter}
            setHealthFilter={setHealthFilter}
            hasActiveFilters={hasActiveFilters}
            clearFilters={clearFilters}
          />
          <ProjectSortMenu
            sortBy={sortBy}
            setSortBy={setSortBy}
            sortOrder={sortOrder}
            setSortOrder={setSortOrder}
          />
          <div className="flex rounded-md border bg-background p-0.5">
            <ViewButton
              active={viewMode === 'list'}
              label={t('toolbar.list_view')}
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </ViewButton>
            <ViewButton
              active={viewMode === 'grid'}
              label={t('toolbar.grid_view')}
              onClick={() => setViewMode('grid')}
            >
              <Grid3x3 className="h-4 w-4" />
            </ViewButton>
          </div>
        </div>
      </div>
    </section>
  );
}

function ViewButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('h-8 w-8 rounded-sm', active && 'bg-dynamic-surface/60')}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
    >
      {children}
    </Button>
  );
}
