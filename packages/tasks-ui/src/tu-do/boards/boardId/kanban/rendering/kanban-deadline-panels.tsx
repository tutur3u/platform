'use client';

import {
  AlertTriangle,
  ArrowDownAZ,
  ArrowUpAZ,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Filter,
  Pin,
  PinOff,
  RotateCcw,
} from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import type React from 'react';
import { useMemo, useState } from 'react';
import { TaskCard } from '../../task';
import type { KanbanDeadlineSections } from './kanban-deadline-tasks';

export type KanbanDeadlineSection = keyof KanbanDeadlineSections;
export type KanbanDeadlineCollapsedState = Partial<
  Record<KanbanDeadlineSection, boolean>
>;

export interface KanbanDeadlineLabels {
  collapseSection?: (name: string) => string;
  expandSection?: (name: string) => string;
  filter?: string;
  overdue: string;
  pinSection?: (name: string) => string;
  reset?: string;
  showDocuments?: string;
  showExternalTasks?: string;
  sort?: string;
  sortCreatedAsc?: string;
  sortCreatedDesc?: string;
  sortDueAsc?: string;
  sortDueDesc?: string;
  sortNameAsc?: string;
  sortSourceAsc?: string;
  unpinSection?: (name: string) => string;
  upcoming: string;
}

interface KanbanDeadlinePanelsProps {
  availableLists: TaskList[];
  boardId: string;
  bulkUpdateCustomDueDate: (date: Date | null) => Promise<void>;
  isPersonalWorkspace: boolean;
  canUseBoardAssignees?: boolean;
  assigneeMemberSource?: 'workspace' | 'board' | 'workspace-and-board';
  labels: KanbanDeadlineLabels;
  onClearSelection: () => void;
  onSectionCollapsedChange?: (
    section: KanbanDeadlineSection,
    collapsed: boolean
  ) => void;
  onSectionPinnedChange?: (
    section: KanbanDeadlineSection,
    pinned: boolean
  ) => void;
  onTaskSelect: (taskId: string, event: React.MouseEvent) => void;
  onUpdate: () => void;
  optimisticUpdateInProgress: Set<string>;
  sections: KanbanDeadlineSections;
  loading?: boolean;
  collapsedSections?: KanbanDeadlineCollapsedState;
  pinnedSections?: KanbanDeadlineCollapsedState;
  stickyOffsets?: Partial<Record<KanbanDeadlineSection, string>>;
  deadlineNow?: number;
  selectedTasks: Set<string>;
  taskLists: TaskList[];
  isMultiSelectMode: boolean;
  workspaceId: string;
}

interface DeadlineSectionConfig {
  icon: typeof AlertTriangle;
  label: string;
  collapsedClassName: string;
  panelClassName: string;
  section: KanbanDeadlineSection;
  titleClassName: string;
}

type DeadlineTaskSortBy =
  | 'created-asc'
  | 'created-desc'
  | 'due-asc'
  | 'due-desc'
  | 'name-asc'
  | 'source-asc';

const DEFAULT_DEADLINE_TASK_SORT_BY: DeadlineTaskSortBy = 'due-asc';
const DOCUMENT_LIST_STATUS = 'documents';

function getTaskTime(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function compareNullableTaskTime(
  a: string | null | undefined,
  b: string | null | undefined,
  ascending: boolean
) {
  const aTime = getTaskTime(a);
  const bTime = getTaskTime(b);

  if (aTime === null && bTime === null) return 0;
  if (aTime === null) return 1;
  if (bTime === null) return -1;

  return ascending ? aTime - bTime : bTime - aTime;
}

function getDeadlineTaskSourceSortText(task: Task) {
  return [
    task.source_workspace_name,
    task.source_board_name,
    task.source_list_name,
    task.name,
  ]
    .filter(Boolean)
    .join(' / ')
    .toLowerCase();
}

function sortDeadlineTasks(tasks: Task[], sortBy: DeadlineTaskSortBy) {
  const sorted = [...tasks];

  sorted.sort((a, b) => {
    switch (sortBy) {
      case 'created-asc':
        return (
          compareNullableTaskTime(a.created_at, b.created_at, true) ||
          a.name.localeCompare(b.name)
        );
      case 'created-desc':
        return (
          compareNullableTaskTime(a.created_at, b.created_at, false) ||
          a.name.localeCompare(b.name)
        );
      case 'due-desc':
        return (
          compareNullableTaskTime(a.end_date, b.end_date, false) ||
          compareNullableTaskTime(a.created_at, b.created_at, false) ||
          a.name.localeCompare(b.name)
        );
      case 'name-asc':
        return (
          a.name.localeCompare(b.name) ||
          compareNullableTaskTime(a.end_date, b.end_date, true)
        );
      case 'source-asc':
        return (
          getDeadlineTaskSourceSortText(a).localeCompare(
            getDeadlineTaskSourceSortText(b)
          ) ||
          compareNullableTaskTime(a.end_date, b.end_date, true) ||
          a.name.localeCompare(b.name)
        );
      default:
        return (
          compareNullableTaskTime(a.end_date, b.end_date, true) ||
          compareNullableTaskTime(a.created_at, b.created_at, false) ||
          a.name.localeCompare(b.name)
        );
    }
  });

  return sorted;
}

function getFallbackTaskList(lists: TaskList[]) {
  return (
    lists.find((list) => list.status === 'active') ??
    lists.find((list) => list.status === 'not_started') ??
    lists[0]
  );
}

function isDocumentDeadlineTask(task: Task, taskList?: TaskList) {
  return (
    task.source_list_status === DOCUMENT_LIST_STATUS ||
    taskList?.status === DOCUMENT_LIST_STATUS
  );
}

function isExternalDeadlineTask(task: Task, taskList?: TaskList) {
  return (
    task.is_personal_external === true ||
    taskList?.is_external_staging === true ||
    Boolean(task.source_workspace_id)
  );
}

function getTaskListForDeadlineTask(task: Task, lists: TaskList[]) {
  return (
    lists.find((list) => String(list.id) === String(task.list_id)) ??
    getFallbackTaskList(lists)
  );
}

function DeadlineSectionSkeleton({
  section,
}: {
  section: KanbanDeadlineSection;
}) {
  return (
    <div
      aria-hidden="true"
      className="space-y-2"
      data-testid={`kanban-deadline-section-${section}-loading`}
    >
      {Array.from({ length: 3 }, (_, index) => (
        <div
          className="rounded-lg border border-border/60 bg-background/60 p-3"
          key={index}
        >
          <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-2 w-1/2 animate-pulse rounded bg-muted" />
          <div className="mt-2 flex gap-2">
            <div className="h-2 w-14 animate-pulse rounded bg-muted" />
            <div className="h-2 w-10 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function DeadlineSection({
  availableLists,
  boardId,
  bulkUpdateCustomDueDate,
  collapsed,
  config,
  deadlineNow,
  loading,
  labels,
  isMultiSelectMode,
  isPersonalWorkspace,
  canUseBoardAssignees,
  assigneeMemberSource,
  onClearSelection,
  onCollapsedChange,
  onPinnedChange,
  onTaskSelect,
  onUpdate,
  optimisticUpdateInProgress,
  pinned,
  selectedTasks,
  stickyOffset,
  taskLists,
  tasks,
  workspaceId,
}: {
  availableLists: TaskList[];
  boardId: string;
  bulkUpdateCustomDueDate: (date: Date | null) => Promise<void>;
  collapsed: boolean;
  config: DeadlineSectionConfig;
  deadlineNow?: number;
  loading?: boolean;
  labels: KanbanDeadlineLabels;
  isMultiSelectMode: boolean;
  isPersonalWorkspace: boolean;
  canUseBoardAssignees?: boolean;
  assigneeMemberSource?: 'workspace' | 'board' | 'workspace-and-board';
  onClearSelection: () => void;
  onCollapsedChange?: (
    section: KanbanDeadlineSection,
    collapsed: boolean
  ) => void;
  onPinnedChange?: (section: KanbanDeadlineSection, pinned: boolean) => void;
  onTaskSelect: (taskId: string, event: React.MouseEvent) => void;
  onUpdate: () => void;
  optimisticUpdateInProgress: Set<string>;
  pinned?: boolean;
  selectedTasks: Set<string>;
  stickyOffset?: string;
  taskLists: TaskList[];
  tasks: Task[];
  workspaceId: string;
}) {
  const Icon = config.icon;
  const collapseLabel =
    labels.collapseSection?.(config.label) ?? `Collapse ${config.label}`;
  const expandLabel =
    labels.expandSection?.(config.label) ?? `Expand ${config.label}`;
  const pinLabel = pinned
    ? (labels.unpinSection?.(config.label) ?? `Unpin ${config.label}`)
    : (labels.pinSection?.(config.label) ?? `Pin ${config.label}`);
  const [includeDocuments, setIncludeDocuments] = useState(true);
  const [includeExternal, setIncludeExternal] = useState(true);
  const [sortBy, setSortBy] = useState<DeadlineTaskSortBy>(
    DEFAULT_DEADLINE_TASK_SORT_BY
  );
  const taskListById = useMemo(
    () => new Map(taskLists.map((list) => [String(list.id), list] as const)),
    [taskLists]
  );
  const visibleTasks = useMemo(() => {
    const filteredTasks = tasks.filter((task) => {
      const taskList = taskListById.get(String(task.list_id));

      if (!includeDocuments && isDocumentDeadlineTask(task, taskList)) {
        return false;
      }

      if (!includeExternal && isExternalDeadlineTask(task, taskList)) {
        return false;
      }

      return true;
    });

    return sortDeadlineTasks(filteredTasks, sortBy);
  }, [includeDocuments, includeExternal, sortBy, taskListById, tasks]);
  const filterCount = (includeDocuments ? 0 : 1) + (includeExternal ? 0 : 1);
  const stickyStyle: React.CSSProperties | undefined = stickyOffset
    ? {
        left: `calc(var(--kanban-snap-left-padding) + ${stickyOffset})`,
      }
    : undefined;

  if (collapsed) {
    return (
      <Card
        className={cn(
          'group flex h-full w-14 shrink-0 snap-start flex-col items-center overflow-hidden rounded-xl border border-dashed transition-all duration-200 hover:shadow-md',
          stickyOffset && 'sticky z-30',
          config.collapsedClassName
        )}
        data-kanban-pinned-special={stickyOffset ? 'true' : undefined}
        data-testid={`kanban-deadline-section-${config.section}-collapsed`}
        style={stickyStyle}
      >
        <button
          type="button"
          className={cn(
            'flex h-full w-full flex-col items-center gap-3 rounded-xl px-1 py-3 transition-colors focus-visible:outline-none focus-visible:ring-2',
            config.titleClassName
          )}
          title={expandLabel}
          aria-label={expandLabel}
          onClick={() => onCollapsedChange?.(config.section, false)}
        >
          <ChevronRight className="h-4 w-4 shrink-0" />
          <Badge
            variant="secondary"
            className="h-5 min-w-5 justify-center px-1 text-[10px]"
          >
            {visibleTasks.length}
          </Badge>
          <span
            className="max-h-48 truncate font-medium text-[11px]"
            style={{ writingMode: 'vertical-rl' }}
          >
            {config.label}
          </span>
        </button>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        'flex h-full w-[var(--kanban-column-width)] shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-dashed shadow-xs',
        stickyOffset && 'sticky z-30',
        config.panelClassName
      )}
      data-kanban-pinned-special={stickyOffset ? 'true' : undefined}
      data-testid={`kanban-deadline-section-${config.section}`}
      style={stickyStyle}
    >
      <div className="flex items-center justify-between gap-3 border-border/70 border-b p-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={cn(
              'inline-flex size-6 shrink-0 items-center justify-center rounded-md border bg-background/70',
              config.titleClassName
            )}
          >
            <Icon className="size-3.5" />
          </span>
          <h3
            className={cn(
              'truncate font-semibold text-sm',
              config.titleClassName
            )}
          >
            {config.label}
          </h3>
          <Badge
            className="h-5 px-1.5 text-[10px]"
            data-testid={`kanban-deadline-section-${config.section}-count`}
            variant="outline"
          >
            {visibleTasks.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className={cn(
                  'relative h-7 w-7 p-0 hover:bg-muted/40',
                  config.titleClassName,
                  filterCount > 0 && 'bg-muted/40'
                )}
                title={labels.filter ?? 'Filters'}
                aria-label={labels.filter ?? 'Filters'}
              >
                <Filter className="h-3.5 w-3.5" />
                {filterCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-current px-0.5 font-medium text-[9px] text-background">
                    {filterCount}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuCheckboxItem
                checked={includeDocuments}
                onCheckedChange={(checked) =>
                  setIncludeDocuments(checked === true)
                }
                onSelect={(event) => event.preventDefault()}
              >
                <FileText className="mr-2 h-3.5 w-3.5 text-dynamic-blue" />
                {labels.showDocuments ?? 'Show document-list tasks'}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={includeExternal}
                onCheckedChange={(checked) =>
                  setIncludeExternal(checked === true)
                }
                onSelect={(event) => event.preventDefault()}
              >
                <ExternalLink className="mr-2 h-3.5 w-3.5 text-dynamic-cyan" />
                {labels.showExternalTasks ?? 'External tasks'}
              </DropdownMenuCheckboxItem>
              {filterCount > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      setIncludeDocuments(true);
                      setIncludeExternal(true);
                    }}
                  >
                    <RotateCcw className="mr-2 h-3.5 w-3.5" />
                    {labels.reset ?? 'Reset'}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className={cn(
                  'h-7 w-7 p-0 hover:bg-muted/40',
                  config.titleClassName,
                  sortBy !== DEFAULT_DEADLINE_TASK_SORT_BY && 'bg-muted/40'
                )}
                title={labels.sort ?? 'Sort'}
                aria-label={labels.sort ?? 'Sort'}
              >
                {sortBy === 'created-asc' ||
                sortBy === 'due-asc' ||
                sortBy === 'name-asc' ||
                sortBy === 'source-asc' ? (
                  <ArrowUpAZ className="h-3.5 w-3.5" />
                ) : (
                  <ArrowDownAZ className="h-3.5 w-3.5" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuRadioGroup
                value={sortBy}
                onValueChange={(value) =>
                  setSortBy(value as DeadlineTaskSortBy)
                }
              >
                <DropdownMenuRadioItem value="due-asc">
                  <CalendarClock className="mr-2 h-3.5 w-3.5" />
                  {labels.sortDueAsc ?? 'Soonest first'}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="due-desc">
                  <CalendarClock className="mr-2 h-3.5 w-3.5" />
                  {labels.sortDueDesc ?? 'Latest first'}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="created-desc">
                  <ArrowDownAZ className="mr-2 h-3.5 w-3.5" />
                  {labels.sortCreatedDesc ?? 'Newest first'}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="created-asc">
                  <ArrowUpAZ className="mr-2 h-3.5 w-3.5" />
                  {labels.sortCreatedAsc ?? 'Oldest first'}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="name-asc">
                  <ArrowUpAZ className="mr-2 h-3.5 w-3.5" />
                  {labels.sortNameAsc ?? 'Task name'}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="source-asc">
                  <ArrowUpAZ className="mr-2 h-3.5 w-3.5" />
                  {labels.sortSourceAsc ?? 'Source board'}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {onPinnedChange ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className={cn(
                'h-7 w-7 p-0 hover:bg-muted/40',
                config.titleClassName,
                pinned && 'bg-muted/40'
              )}
              title={pinLabel}
              aria-label={pinLabel}
              onClick={() => onPinnedChange(config.section, !pinned)}
            >
              {pinned ? (
                <PinOff className="h-3.5 w-3.5" />
              ) : (
                <Pin className="h-3.5 w-3.5" />
              )}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="xs"
            className={cn(
              'h-7 w-7 p-0 hover:bg-muted/40',
              config.titleClassName
            )}
            title={collapseLabel}
            aria-label={collapseLabel}
            onClick={() => onCollapsedChange?.(config.section, true)}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {loading && visibleTasks.length === 0 ? (
          <DeadlineSectionSkeleton section={config.section} />
        ) : (
          visibleTasks.map((task) => {
            const taskList = getTaskListForDeadlineTask(task, taskLists);

            return (
              <div
                key={task.id}
                className="shrink-0"
                data-testid={`kanban-deadline-task-card-${task.id}`}
              >
                <TaskCard
                  availableLists={availableLists}
                  boardId={boardId}
                  bulkUpdateCustomDueDate={bulkUpdateCustomDueDate}
                  dragDisabled
                  isMultiSelectMode={isMultiSelectMode}
                  isPersonalWorkspace={isPersonalWorkspace}
                  canUseBoardAssignees={canUseBoardAssignees}
                  assigneeMemberSource={assigneeMemberSource}
                  isSelected={selectedTasks.has(task.id)}
                  onClearSelection={onClearSelection}
                  onSelect={onTaskSelect}
                  onUpdate={onUpdate}
                  optimisticUpdateInProgress={optimisticUpdateInProgress}
                  selectedTasks={selectedTasks}
                  deadlineContext={config.section}
                  deadlineNow={deadlineNow}
                  sortableId={`deadline-${config.section}-${task.id}`}
                  task={task}
                  taskList={taskList}
                  workspaceId={workspaceId}
                />
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}

export function KanbanDeadlinePanels({
  availableLists,
  boardId,
  bulkUpdateCustomDueDate,
  isMultiSelectMode,
  isPersonalWorkspace,
  canUseBoardAssignees,
  assigneeMemberSource,
  labels,
  onClearSelection,
  onSectionCollapsedChange,
  onSectionPinnedChange,
  onTaskSelect,
  onUpdate,
  optimisticUpdateInProgress,
  sections,
  loading,
  collapsedSections,
  pinnedSections,
  stickyOffsets,
  deadlineNow,
  selectedTasks,
  taskLists,
  workspaceId,
}: KanbanDeadlinePanelsProps) {
  const configs: DeadlineSectionConfig[] = [
    {
      icon: AlertTriangle,
      label: labels.overdue,
      collapsedClassName: 'border-dynamic-red/35 bg-dynamic-red/5',
      panelClassName: 'border-dynamic-red/25 bg-dynamic-red/5',
      section: 'overdue',
      titleClassName:
        'border-dynamic-red/25 text-dynamic-red hover:bg-dynamic-red/10 focus-visible:ring-dynamic-red/40',
    },
    {
      icon: CalendarClock,
      label: labels.upcoming,
      collapsedClassName: 'border-dynamic-blue/35 bg-dynamic-blue/5',
      panelClassName: 'border-dynamic-blue/25 bg-dynamic-blue/5',
      section: 'upcoming',
      titleClassName:
        'border-dynamic-blue/25 text-dynamic-blue hover:bg-dynamic-blue/10 focus-visible:ring-dynamic-blue/40',
    },
  ];

  return (
    <div className="contents" data-testid="kanban-deadline-panels">
      {configs.map((config) => (
        <DeadlineSection
          key={config.section}
          availableLists={availableLists}
          boardId={boardId}
          bulkUpdateCustomDueDate={bulkUpdateCustomDueDate}
          collapsed={collapsedSections?.[config.section] === true}
          config={config}
          deadlineNow={deadlineNow}
          labels={labels}
          loading={loading === true && sections[config.section].length === 0}
          isMultiSelectMode={isMultiSelectMode}
          isPersonalWorkspace={isPersonalWorkspace}
          canUseBoardAssignees={canUseBoardAssignees}
          assigneeMemberSource={assigneeMemberSource}
          onClearSelection={onClearSelection}
          onCollapsedChange={onSectionCollapsedChange}
          onPinnedChange={onSectionPinnedChange}
          onTaskSelect={onTaskSelect}
          onUpdate={onUpdate}
          optimisticUpdateInProgress={optimisticUpdateInProgress}
          pinned={pinnedSections?.[config.section] === true}
          selectedTasks={selectedTasks}
          stickyOffset={stickyOffsets?.[config.section]}
          taskLists={taskLists}
          tasks={sections[config.section]}
          workspaceId={workspaceId}
        />
      ))}
    </div>
  );
}
