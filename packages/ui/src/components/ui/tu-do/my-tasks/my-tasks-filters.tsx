'use client';

import { Box, Tag, UserRoundCog, X } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { LabelProjectFilter } from './label-project-filter';
import { TaskFilter } from './task-filter';

interface TaskFiltersState {
  workspaceIds: string[];
  boardIds: string[];
  labelIds: string[];
  projectIds: string[];
  selfManagedOnly: boolean;
}

interface MyTasksFiltersProps {
  workspacesData: Array<{
    id: string;
    name: string | null;
    personal: boolean | null;
  }>;
  allBoardsData: Array<{ id: string; name: string | null; ws_id: string }>;
  taskFilters: TaskFiltersState;
  setTaskFilters: React.Dispatch<React.SetStateAction<TaskFiltersState>>;
  availableLabels: any[];
  availableProjects: any[];
  workspaceLabels: any[];
  workspaceProjects: any[];
  onFilterChange: (filters: Record<string, any>) => void;
  onLabelFilterChange: (ids: string[]) => void;
  onProjectFilterChange: (ids: string[]) => void;
  onCreateNewBoard: () => void;
}

export function MyTasksFilters({
  workspacesData,
  allBoardsData,
  taskFilters,
  setTaskFilters,
  availableLabels,
  availableProjects,
  workspaceLabels,
  workspaceProjects,
  onFilterChange,
  onLabelFilterChange,
  onProjectFilterChange,
  onCreateNewBoard,
}: MyTasksFiltersProps) {
  const t = useTranslations();
  const hasActiveFilters =
    !taskFilters.workspaceIds.includes('all') ||
    !taskFilters.boardIds.includes('all') ||
    taskFilters.labelIds.length > 0 ||
    taskFilters.projectIds.length > 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-nowrap justify-start gap-2">
        <TaskFilter
          workspaces={(workspacesData || []).map((ws) => ({
            ...ws,
            name: ws.name || 'Unnamed Workspace',
          }))}
          boards={(allBoardsData || []).map((board) => ({
            ...board,
            name: board.name || 'Unnamed Board',
          }))}
          onFilterChange={onFilterChange}
          onCreateNewBoard={onCreateNewBoard}
        />
        <LabelProjectFilter
          labels={availableLabels || []}
          projects={availableProjects || []}
          selectedLabelIds={taskFilters.labelIds}
          selectedProjectIds={taskFilters.projectIds}
          onSelectedLabelIdsChange={onLabelFilterChange}
          onSelectedProjectIdsChange={onProjectFilterChange}
        />

        <Button
          variant={taskFilters.selfManagedOnly ? 'default' : 'outline'}
          size="sm"
          onClick={() =>
            setTaskFilters((prev) => ({
              ...prev,
              selfManagedOnly: !prev.selfManagedOnly,
            }))
          }
          className="shrink-0 gap-1.5"
        >
          <UserRoundCog className="h-3.5 w-3.5" />
          {t('ws-tasks.self_managed')}
        </Button>

        {/* Filter Chips */}
        {hasActiveFilters && (
          <div className="flex items-center gap-2">
            {(!taskFilters.workspaceIds.includes('all') ||
              !taskFilters.boardIds.includes('all')) && (
              <FilterChip
                onClear={() =>
                  setTaskFilters((prev) => ({
                    ...prev,
                    workspaceIds: ['all'],
                    boardIds: ['all'],
                  }))
                }
                tooltipContent={
                  <>
                    {!taskFilters.workspaceIds.includes('all') &&
                      workspacesData
                        ?.filter((ws) =>
                          taskFilters.workspaceIds.includes(ws.id)
                        )
                        .map((ws) => <div key={ws.id}>{ws.name}</div>)}
                    {!taskFilters.boardIds.includes('all') &&
                      allBoardsData
                        ?.filter((b) => taskFilters.boardIds.includes(b.id))
                        .map((b) => <div key={b.id}>{b.name}</div>)}
                  </>
                }
                showTooltip={
                  taskFilters.workspaceIds.length > 1 ||
                  taskFilters.boardIds.length > 1
                }
              >
                {(() => {
                  const selectedWorkspaces = workspacesData?.filter((ws) =>
                    taskFilters.workspaceIds.includes(ws.id)
                  );
                  const selectedBoards = allBoardsData?.filter((b) =>
                    taskFilters.boardIds.includes(b.id)
                  );

                  const workspaceText = !taskFilters.workspaceIds.includes(
                    'all'
                  )
                    ? taskFilters.workspaceIds.length > 1
                      ? `${taskFilters.workspaceIds.length} Workspaces`
                      : selectedWorkspaces?.[0]?.name
                    : '';

                  const boardText = !taskFilters.boardIds.includes('all')
                    ? taskFilters.boardIds.length > 1
                      ? `${taskFilters.boardIds.length} Boards`
                      : selectedBoards?.[0]?.name
                    : '';

                  if (workspaceText && boardText)
                    return `${workspaceText} / ${boardText}`;
                  return workspaceText || boardText || '';
                })()}
              </FilterChip>
            )}
            {taskFilters.labelIds.length > 0 && (
              <FilterChip
                icon={<Tag className="h-3.5 w-3.5" />}
                onClear={() =>
                  setTaskFilters((prev) => ({ ...prev, labelIds: [] }))
                }
                tooltipContent={workspaceLabels
                  ?.filter((l: any) => taskFilters.labelIds.includes(l.id))
                  .map((l: any) => <div key={l.id}>{l.name}</div>)}
                showTooltip={taskFilters.labelIds.length > 1}
              >
                {taskFilters.labelIds.length > 1
                  ? `${taskFilters.labelIds.length} Labels`
                  : workspaceLabels?.find(
                      (l: any) => l.id === taskFilters.labelIds[0]
                    )?.name}
              </FilterChip>
            )}
            {taskFilters.projectIds.length > 0 && (
              <FilterChip
                icon={<Box className="h-3.5 w-3.5" />}
                onClear={() =>
                  setTaskFilters((prev) => ({ ...prev, projectIds: [] }))
                }
                tooltipContent={workspaceProjects
                  ?.filter((p: any) => taskFilters.projectIds.includes(p.id))
                  .map((p: any) => <div key={p.id}>{p.name}</div>)}
                showTooltip={taskFilters.projectIds.length > 1}
              >
                {taskFilters.projectIds.length > 1
                  ? `${taskFilters.projectIds.length} Projects`
                  : workspaceProjects?.find(
                      (p: any) => p.id === taskFilters.projectIds[0]
                    )?.name}
              </FilterChip>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface FilterChipProps {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClear: () => void;
  tooltipContent?: React.ReactNode;
  showTooltip?: boolean;
}

function FilterChip({
  icon,
  children,
  onClear,
  tooltipContent,
  showTooltip,
}: FilterChipProps) {
  const chip = (
    <Badge
      variant="secondary"
      className="group/chip flex items-center gap-x-1.5 rounded-md bg-dynamic-blue/10 px-2.5 py-1 font-medium text-dynamic-blue text-sm"
    >
      {icon}
      <span>{children}</span>
      <button
        type="button"
        onClick={onClear}
        className="h-full w-0 overflow-hidden pr-0 opacity-0 transition-all group-hover/chip:w-4 group-hover/chip:pr-1 group-hover/chip:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </Badge>
  );

  if (!showTooltip) return chip;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex">{chip}</div>
        </TooltipTrigger>
        <TooltipContent>{tooltipContent}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
