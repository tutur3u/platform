'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Input } from '@tuturuuu/ui/input';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Calendar,
  ChevronDown,
  Filter,
  Grid3x3,
  List,
  Plus,
  X,
} from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import type { ViewMode, SortBy, SortOrder } from '../types';

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
  setStatusFilter: (status: string[] | ((prev: string[]) => string[])) => void;
  priorityFilter: string[];
  setPriorityFilter: (
    priority: string[] | ((prev: string[]) => string[])
  ) => void;
  healthFilter: string[];
  setHealthFilter: (health: string[] | ((prev: string[]) => string[])) => void;
  hasActiveFilters: boolean;
  clearFilters: () => void;
  projectCount: number;
  filteredCount: number;
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
  onCreateClick,
}: ProjectsToolbarProps) {
  const t = useTranslations('task-projects');

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="font-semibold text-lg">{t('toolbar.all_projects')}</h2>
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

      <div className="flex flex-wrap items-center gap-2">
        {/* Search */}
        <div className="relative">
          <Input
            placeholder={t('toolbar.search_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full md:w-64"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2"
              onClick={() => setSearchQuery('')}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        {/* Filters */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                hasActiveFilters &&
                  'border-dynamic-purple/50 bg-dynamic-purple/10'
              )}
            >
              <Filter className="mr-2 h-4 w-4" />
              {t('toolbar.filters')}
              {hasActiveFilters && (
                <Badge
                  variant="secondary"
                  className="ml-2 h-5 w-5 rounded-full p-0 text-xs"
                >
                  {statusFilter.length +
                    priorityFilter.length +
                    healthFilter.length}
                </Badge>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {/* Status Filter */}
            <div className="px-2 py-1.5">
              <p className="mb-2 font-medium text-sm">
                {t('toolbar.filter_status')}
              </p>
              {[
                'backlog',
                'planned',
                'in_progress',
                'in_review',
                'completed',
                'cancelled',
                'active',
                'on_hold',
              ].map((status) => (
                <DropdownMenuCheckboxItem
                  key={status}
                  checked={statusFilter.includes(status)}
                  onCheckedChange={(checked) => {
                    setStatusFilter((prev) =>
                      checked
                        ? [...prev, status]
                        : prev.filter((s) => s !== status)
                    );
                  }}
                >
                  {t(`status.${status}` as any)}
                </DropdownMenuCheckboxItem>
              ))}
            </div>

            <DropdownMenuSeparator />

            {/* Priority Filter */}
            <div className="px-2 py-1.5">
              <p className="mb-2 font-medium text-sm">
                {t('toolbar.filter_priority')}
              </p>
              {['critical', 'high', 'normal', 'low'].map((priority) => (
                <DropdownMenuCheckboxItem
                  key={priority}
                  checked={priorityFilter.includes(priority)}
                  onCheckedChange={(checked) => {
                    setPriorityFilter((prev) =>
                      checked
                        ? [...prev, priority]
                        : prev.filter((p) => p !== priority)
                    );
                  }}
                >
                  {t(`badges.${priority}` as any)}
                </DropdownMenuCheckboxItem>
              ))}
            </div>

            <DropdownMenuSeparator />

            {/* Health Filter */}
            <div className="px-2 py-1.5">
              <p className="mb-2 font-medium text-sm">
                {t('toolbar.filter_health')}
              </p>
              {['on_track', 'at_risk', 'off_track'].map((health) => (
                <DropdownMenuCheckboxItem
                  key={health}
                  checked={healthFilter.includes(health)}
                  onCheckedChange={(checked) => {
                    setHealthFilter((prev) =>
                      checked
                        ? [...prev, health]
                        : prev.filter((h) => h !== health)
                    );
                  }}
                >
                  {health === 'on_track'
                    ? `🟢 ${t('badges.on_track')}`
                    : health === 'at_risk'
                      ? `🟡 ${t('badges.at_risk')}`
                      : `🔴 ${t('badges.off_track')}`}
                </DropdownMenuCheckboxItem>
              ))}
            </div>

            {hasActiveFilters && (
              <>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={clearFilters}
                  >
                    {t('toolbar.clear_all_filters')}
                  </Button>
                </div>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Sort */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <ChevronDown className="mr-2 h-4 w-4" />
              {t('toolbar.sort')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setSortBy('created_at')}>
              <Calendar className="mr-2 h-4 w-4" />
              {t('toolbar.sort_created_date')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('name')}>
              {t('toolbar.sort_name')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('status')}>
              {t('toolbar.sort_status')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('priority')}>
              {t('toolbar.sort_priority')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('health_status')}>
              {t('toolbar.sort_health_status')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortBy('tasks_count')}>
              {t('toolbar.sort_task_count')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
              }}
            >
              {sortOrder === 'asc'
                ? t('toolbar.sort_ascending')
                : t('toolbar.sort_descending')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* View Mode Toggle */}
        <div className="flex rounded-md border">
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            className="rounded-r-none"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="sm"
            className="rounded-l-none"
            onClick={() => setViewMode('grid')}
          >
            <Grid3x3 className="h-4 w-4" />
          </Button>
        </div>

        <Button onClick={onCreateClick}>
          <Plus className="mr-2 h-4 w-4" />
          {t('toolbar.new_project')}
        </Button>
      </div>
    </div>
  );
}

