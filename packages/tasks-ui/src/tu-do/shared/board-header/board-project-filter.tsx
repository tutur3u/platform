import { useQuery } from '@tanstack/react-query';
import { Box, ChevronDown } from '@tuturuuu/icons';
import { listWorkspaceTaskProjects } from '@tuturuuu/internal-api/tasks';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import type { TaskFilters, TaskProject } from '../task-filter.types';
import { toggleProjectFilter } from './board-filter-state';
import { ToneButton } from './tone-button';

export function BoardProjectFilter({
  filters,
  onFiltersChange,
  projectTaskCounts,
  workspaceId,
  countsComplete = true,
}: {
  filters: TaskFilters;
  onFiltersChange: (filters: TaskFilters) => void;
  projectTaskCounts: Map<string, number>;
  workspaceId: string;
  countsComplete?: boolean;
}) {
  const t = useTranslations();
  // Same cache entry the task dialogs use for workspace projects.
  const { data: projects = [] } = useQuery({
    queryKey: ['workspace-projects', workspaceId],
    queryFn: async () =>
      (await listWorkspaceTaskProjects(workspaceId))
        .filter((project) => project.status !== 'deleted')
        .map((project) => ({
          id: project.id,
          name: project.name,
        })) as TaskProject[],
    enabled: Boolean(workspaceId),
  });
  const selectedIds = useMemo(
    () => new Set(filters.projects.map((project) => project.id)),
    [filters.projects]
  );
  const label =
    filters.projects.length === 0
      ? t('ws-task-boards.header.project')
      : filters.projects.length === 1
        ? (filters.projects[0]?.name ?? t('ws-task-boards.header.project'))
        : t('ws-task-boards.header.projects_selected', {
            count: filters.projects.length,
          });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ToneButton
          active={filters.projects.length > 0}
          aria-label={label}
          tone="neutral"
        >
          <Box />
          <span className="@2xl/board-header:inline hidden max-w-40 truncate">
            {label}
          </span>
          <ChevronDown className="@sm/board-header:block hidden opacity-60" />
        </ToneButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {projects.length === 0 ? (
          <p className="px-2 py-2 text-muted-foreground text-xs">
            {t('ws-task-boards.header.no_projects')}
          </p>
        ) : (
          projects.map((project) => (
            <DropdownMenuCheckboxItem
              key={project.id}
              checked={selectedIds.has(project.id)}
              onCheckedChange={() =>
                onFiltersChange(toggleProjectFilter(filters, project))
              }
              onSelect={(event) => event.preventDefault()}
            >
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              {countsComplete ? (
                <span className="text-muted-foreground text-xs">
                  {projectTaskCounts.get(project.id) ?? 0}
                </span>
              ) : null}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
