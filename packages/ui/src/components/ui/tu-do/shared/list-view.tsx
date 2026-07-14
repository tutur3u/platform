'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  horseHead,
  Icon,
  MoreHorizontal,
  Rabbit,
  Turtle,
  unicornHead,
  X,
} from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useUserBooleanConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { Separator } from '@tuturuuu/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@tuturuuu/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { format, isPast, isToday, isTomorrow } from 'date-fns';
import { enUS, vi } from 'date-fns/locale';
import Image from 'next/image';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBulkOperations } from '../boards/boardId/kanban/bulk/bulk-operations';
import type { TaskCardAssigneeMemberSource } from '../boards/boardId/task-card/task-card';
import { TASK_CARD_SELECTION_CHECKBOX_BASE_CLASSES } from '../boards/boardId/task-card/task-card-checkbox-style';
import {
  getTaskCardHydratingOpenOptions,
  isExternalTaskSnapshot,
} from '../boards/boardId/task-card/task-card-open-options';
import { useTaskDialog } from '../hooks/useTaskDialog';
import { computeAccessibleLabelStyles } from '../utils/label-colors';
import { useBoardBroadcast } from './board-broadcast-context';
import {
  type ListViewSortField,
  type ListViewSortOrder,
  sortListViewTasks,
} from './list-view-sorting';
import {
  shouldShowTaskDueDate,
  TASKS_SHOW_REVIEW_DUE_DATES_CONFIG_ID,
} from './task-due-date-visibility';
import { TaskRowActionsMenu } from './task-row-actions-menu';

interface Props {
  workspaceId: string;
  boardId: string;
  tasks: Task[];
  lists: TaskList[];
  isPersonalWorkspace?: boolean;
  canUseBoardAssignees?: boolean;
  assigneeMemberSource?: TaskCardAssigneeMemberSource;
  preserveTaskOrder?: boolean;
  searchQuery?: string;
  weekStartsOn?: 0 | 1 | 6;
  readOnly?: boolean;
}

interface ColumnVisibility {
  status: boolean;
  name: boolean;
  priority: boolean;
  start_date: boolean;
  end_date: boolean;
  assignees: boolean;
  actions: boolean;
}

type TaskMenuState = {
  taskId: string;
  point?: { x: number; y: number } | null;
};

export function ListView(props: Props) {
  if (props.readOnly) {
    return <ReadOnlyListView {...props} />;
  }

  return <InteractiveListView {...props} />;
}

function ReadOnlyListView({
  tasks,
  lists,
  isPersonalWorkspace = false,
  canUseBoardAssignees,
  preserveTaskOrder = false,
  searchQuery,
}: Props) {
  const t = useTranslations();
  const tc = useTranslations('common');
  const locale = useLocale();
  const dateLocale = locale === 'vi' ? vi : enUS;
  const [sortField, setSortField] = useState<ListViewSortField>('created_at');
  const [sortOrder, setSortOrder] = useState<ListViewSortOrder>('desc');
  const showAssignees = canUseBoardAssignees ?? !isPersonalWorkspace;
  const listsById = useMemo(
    () => new Map(lists.map((list) => [list.id, list])),
    [lists]
  );
  const sortedTasks = useMemo(
    () =>
      sortListViewTasks(tasks, {
        preserveTaskOrder,
        searchQuery,
        sortField,
        sortOrder,
      }),
    [preserveTaskOrder, searchQuery, sortField, sortOrder, tasks]
  );

  function handleSort(field: ListViewSortField) {
    if (field === sortField) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }

  function getSortIcon(field: ListViewSortField) {
    if (sortField !== field) {
      return <ArrowDownUp className="ml-2 h-3 w-3 text-muted-foreground" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="ml-2 h-3 w-3 text-foreground" />
    ) : (
      <ArrowDown className="ml-2 h-3 w-3 text-foreground" />
    );
  }

  function formatDate(date: string) {
    return format(new Date(date), 'MMM dd', { locale: dateLocale });
  }

  return (
    <div className="flex h-full flex-col">
      {sortedTasks.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground text-sm">{tc('no_tasks')}</p>
        </div>
      ) : (
        <div className="relative flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 border-b bg-background">
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 min-w-62.5 px-3">
                  <Button
                    variant="ghost"
                    className={cn(
                      '-ml-2 h-6 justify-start gap-1 px-2 font-medium text-[10px] uppercase tracking-wider transition-colors hover:bg-muted/50',
                      sortField === 'name'
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    )}
                    onClick={() => handleSort('name')}
                  >
                    {tc('task_header')}
                    {getSortIcon('name')}
                  </Button>
                </TableHead>
                <TableHead className="h-9 w-32 px-2">
                  <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
                    {tc('status')}
                  </span>
                </TableHead>
                <TableHead className="h-9 w-24 px-2">
                  <Button
                    variant="ghost"
                    className={cn(
                      '-ml-2 h-6 justify-start gap-1 px-2 font-medium text-[10px] uppercase tracking-wider transition-colors hover:bg-muted/50',
                      sortField === 'priority'
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    )}
                    onClick={() => handleSort('priority')}
                  >
                    {tc('priority')}
                    {getSortIcon('priority')}
                  </Button>
                </TableHead>
                <TableHead className="h-9 w-28 px-2">
                  <Button
                    variant="ghost"
                    className={cn(
                      '-ml-2 h-6 justify-start gap-1 px-2 font-medium text-[10px] uppercase tracking-wider transition-colors hover:bg-muted/50',
                      sortField === 'end_date'
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    )}
                    onClick={() => handleSort('end_date')}
                  >
                    {tc('due')}
                    {getSortIcon('end_date')}
                  </Button>
                </TableHead>
                {showAssignees && (
                  <TableHead className="h-9 w-32 px-2">
                    <span className="font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
                      {tc('assignee')}
                    </span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTasks.map((task) => {
                const list = listsById.get(task.list_id);
                return (
                  <TableRow key={task.id} className="h-12 border-b">
                    <TableCell className="px-3 py-2">
                      <div className="min-w-0 space-y-1">
                        <div
                          className={cn(
                            'truncate font-medium text-sm',
                            (task.completed_at || task.closed_at) &&
                              'text-muted-foreground line-through'
                          )}
                        >
                          {task.name}
                        </div>
                        {(task.labels?.length || task.projects?.length) && (
                          <div className="flex flex-wrap items-center gap-1">
                            {task.labels?.slice(0, 3).map((label) => (
                              <Badge
                                key={label.id}
                                variant="outline"
                                className="h-4 gap-1 px-1.5 font-normal text-[10px]"
                              >
                                <span
                                  aria-hidden="true"
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: label.color }}
                                />
                                {label.name}
                              </Badge>
                            ))}
                            {task.projects?.slice(0, 2).map((project) => (
                              <Badge
                                key={project.id}
                                variant="secondary"
                                className="h-4 px-1.5 font-normal text-[10px]"
                              >
                                {project.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      <Badge variant="outline" className="font-normal">
                        {list?.name ?? tc('untitled')}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      {task.priority && (
                        <Badge variant="secondary" className="font-normal">
                          {t(`tasks.priority_${task.priority}`)}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="px-2 py-2">
                      {task.end_date && (
                        <span className="text-muted-foreground text-xs">
                          {formatDate(task.end_date)}
                        </span>
                      )}
                    </TableCell>
                    {showAssignees && (
                      <TableCell className="px-2 py-2">
                        {task.assignees && task.assignees.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {task.assignees.slice(0, 2).map((assignee) => (
                              <Badge
                                key={assignee.id}
                                variant="secondary"
                                className="font-normal"
                              >
                                {assignee.display_name ||
                                  assignee.email ||
                                  assignee.handle ||
                                  tc('assignee')}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function InteractiveListView({
  workspaceId,
  boardId,
  tasks,
  lists,
  isPersonalWorkspace = false,
  canUseBoardAssignees,
  assigneeMemberSource,
  preserveTaskOrder = false,
  searchQuery,
  weekStartsOn = 0,
}: Props) {
  const t = useTranslations();
  const tc = useTranslations('common');
  const locale = useLocale();
  const dateLocale = locale === 'vi' ? vi : enUS;
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { value: showReviewDueDates } = useUserBooleanConfig(
    TASKS_SHOW_REVIEW_DUE_DATES_CONFIG_ID,
    false
  );
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks);
  const [sortField, setSortField] = useState<ListViewSortField>('created_at');
  const [sortOrder, setSortOrder] = useState<ListViewSortOrder>('desc');
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set());
  const [openTaskMenu, setOpenTaskMenu] = useState<TaskMenuState | null>(null);
  const previousWorkspaceIdRef = useRef(workspaceId);
  const previousBoardIdRef = useRef(boardId);
  const { openTask, openTaskById } = useTaskDialog();
  const showAssignees = canUseBoardAssignees ?? !isPersonalWorkspace;
  const effectiveAssigneeMemberSource =
    assigneeMemberSource ?? (isPersonalWorkspace ? 'board' : 'workspace');

  // Infinite scroll
  const [displayCount, setDisplayCount] = useState(50);
  const LOAD_MORE_COUNT = 50;

  // Column visibility
  const [columnVisibility] = useState<ColumnVisibility>({
    status: true,
    name: true,
    priority: true,
    start_date: false,
    end_date: true,
    assignees: showAssignees,
    actions: true,
  });

  // Bulk actions state
  const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
  const [bulkWorking, setBulkWorking] = useState(false);

  // Clear selection helper
  const clearSelection = useCallback(() => {
    setSelectedTasks(new Set());
  }, []);

  // Bulk operations hook
  const broadcast = useBoardBroadcast();
  const { bulkDeleteTasks, bulkUpdateDueDate, bulkUpdatePriority } =
    useBulkOperations({
      queryClient,
      wsId: workspaceId,
      boardId,
      selectedTasks,
      columns: lists,
      weekStartsOn,
      setBulkWorking,
      clearSelection,
      setBulkDeleteOpen: setShowBulkDeleteDialog,
      broadcast,
    });

  // Bulk delete function
  const handleBulkDelete = async () => {
    if (selectedTasks.size === 0) return;
    setShowBulkDeleteDialog(true);
  };

  const handleBulkDeleteConfirmed = async () => {
    try {
      await bulkDeleteTasks();
    } catch (error) {
      console.error('Error deleting tasks:', error);
    }
  };

  // Update local state when props change
  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  useEffect(() => {
    const previousWorkspaceId = previousWorkspaceIdRef.current;
    const previousBoardId = previousBoardIdRef.current;
    const workspaceChanged = previousWorkspaceId !== workspaceId;
    const boardChanged = previousBoardId !== boardId;

    if (!workspaceChanged && !boardChanged) {
      return;
    }

    previousWorkspaceIdRef.current = workspaceId;
    previousBoardIdRef.current = boardId;
    setDisplayCount(50);
    clearSelection();
    if (previousBoardId) {
      void queryClient.cancelQueries({ queryKey: ['tasks', previousBoardId] });
      void queryClient.cancelQueries({
        queryKey: ['deleted-tasks', previousBoardId],
      });
    }
  }, [boardId, clearSelection, queryClient, workspaceId]);

  // Apply sorting only (filters are handled by parent)
  const sortedTasks = useMemo(() => {
    return sortListViewTasks(localTasks, {
      preserveTaskOrder,
      searchQuery,
      sortField,
      sortOrder,
    });
  }, [localTasks, preserveTaskOrder, searchQuery, sortField, sortOrder]);

  // Display tasks with incremental rendering
  const displayedTasks = useMemo(() => {
    return sortedTasks.slice(0, displayCount);
  }, [sortedTasks, displayCount]);

  const hasMore = displayCount < sortedTasks.length;
  const listsById = useMemo(
    () => new Map(lists.map((list) => [list.id, list])),
    [lists]
  );

  const getTaskList = useCallback(
    (task: Task) => (task.list_id ? listsById.get(task.list_id) : undefined),
    [listsById]
  );

  function handleSort(field: ListViewSortField) {
    if (field === sortField) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }

  function getSortIcon(field: ListViewSortField) {
    if (sortField !== field) {
      return <ArrowDownUp className="ml-2 h-3 w-3 text-muted-foreground" />;
    }
    return sortOrder === 'asc' ? (
      <ArrowUp className="ml-2 h-3 w-3 text-foreground" />
    ) : (
      <ArrowDown className="ml-2 h-3 w-3 text-foreground" />
    );
  }

  function handleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedTasks(new Set(displayedTasks.map((task) => task.id)));
    } else {
      setSelectedTasks(new Set());
    }
  }

  function handleSelectTask(taskId: string, checked: boolean) {
    const newSelected = new Set(selectedTasks);
    if (checked) {
      newSelected.add(taskId);
    } else {
      newSelected.delete(taskId);
    }
    setSelectedTasks(newSelected);
  }

  function openTaskFromRow(task: Task) {
    if (isExternalTaskSnapshot(task)) {
      void openTaskById(
        task.id,
        getTaskCardHydratingOpenOptions({
          task,
          boardId,
          availableLists: lists,
          effectiveWorkspaceId: workspaceId,
          isPersonalWorkspace,
          canUseBoardAssignees: task.source_workspace_id ? true : showAssignees,
          assigneeMemberSource: task.source_workspace_id
            ? 'board'
            : effectiveAssigneeMemberSource,
        })
      );
      return;
    }

    openTask(task, boardId, lists, false, {
      taskWsId: workspaceId,
      taskWorkspacePersonal: isPersonalWorkspace,
      canUseBoardAssignees: showAssignees,
      assigneeMemberSource: effectiveAssigneeMemberSource,
    });
  }

  // Infinite scroll handler
  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLDivElement;
      if (!target) return;

      const { scrollTop, scrollHeight, clientHeight } = target;
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

      // Load more when user scrolls to 80%
      if (scrollPercentage > 0.8 && hasMore) {
        setDisplayCount((prev) => prev + LOAD_MORE_COUNT);
      }
    };

    const scrollContainer = document.querySelector('[data-scroll-container]');
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
      return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }
  }, [hasMore]);

  function formatDate(date: string) {
    const dateObj = new Date(date);

    if (isToday(dateObj)) {
      return tc('today');
    }

    if (isTomorrow(dateObj)) {
      return tc('tomorrow');
    }

    return format(dateObj, 'MMM dd', { locale: dateLocale });
  }

  function renderTaskStatus(task: Task) {
    const list = getTaskList(task);

    // Documents lists don't support completion status
    const isInDocumentsList = list?.status === 'documents';

    if (isInDocumentsList) {
      return (
        <div className="flex items-center justify-center">
          <span className="text-muted-foreground text-xs">—</span>
        </div>
      );
    }

    if (task.closed_at) {
      return (
        <div className="flex items-center justify-center">
          <CheckCircle2 className="h-4 w-4 text-dynamic-green/80" />
        </div>
      );
    }

    const isInCompletedList =
      list?.status === 'review' || list?.status === 'done';

    return (
      <div className="flex items-center justify-center">
        <div
          className={cn(
            'h-4 w-4 rounded-full border-2',
            isInCompletedList
              ? 'animate-pulse border-amber-500/30 bg-amber-500/60 [animation-duration:4s]'
              : 'border-muted-foreground/30'
          )}
          title={
            isInCompletedList
              ? `Task is in ${list.status === 'review' ? 'Review' : 'Done'} list but not individually checked`
              : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {sortedTasks.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="text-muted-foreground text-sm">{tc('no_tasks')}</p>
          </div>
        </div>
      ) : (
        <div className="relative flex-1 overflow-auto" data-scroll-container>
          <TooltipProvider>
            <Table>
              <TableHeader className="sticky top-0 z-10 border-b">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="flex h-7 items-center justify-center px-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Checkbox
                          checked={
                            selectedTasks.size === displayedTasks.length &&
                            displayedTasks.length > 0
                          }
                          onCheckedChange={(checked) =>
                            handleSelectAll(!!checked)
                          }
                          aria-label={tc('select_all_tasks')}
                          className={cn(
                            TASK_CARD_SELECTION_CHECKBOX_BASE_CLASSES,
                            '!border-2 !border-primary/70 data-[state=checked]:!border-primary/80 bg-primary/5 ring-1 ring-primary/15 data-[state=checked]:bg-primary/20 data-[state=checked]:text-primary'
                          )}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {tc('select_all_tasks')}
                      </TooltipContent>
                    </Tooltip>
                  </TableHead>
                  {columnVisibility.status && (
                    <TableHead className="h-9 w-10 px-2 text-center">
                      <span className="flex items-center justify-center font-medium text-[10px] text-muted-foreground uppercase tracking-wider">
                        {tc('status')}
                      </span>
                    </TableHead>
                  )}
                  {columnVisibility.name && (
                    <TableHead className="h-9 min-w-62.5 px-2">
                      <Button
                        variant="ghost"
                        className={cn(
                          '-ml-2 h-6 justify-start gap-1 px-2 font-medium text-[10px] uppercase tracking-wider transition-colors hover:bg-muted/50',
                          sortField === 'name'
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                        )}
                        onClick={() => handleSort('name')}
                      >
                        {tc('task_header')}
                        {getSortIcon('name')}
                      </Button>
                    </TableHead>
                  )}
                  {columnVisibility.priority && (
                    <TableHead className="h-9 w-22.5 px-2">
                      <Button
                        variant="ghost"
                        className={cn(
                          '-ml-2 h-6 justify-start gap-1 px-2 font-medium text-[10px] uppercase tracking-wider transition-colors hover:bg-muted/50',
                          sortField === 'priority'
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                        )}
                        onClick={() => handleSort('priority')}
                      >
                        {tc('priority')}
                        {getSortIcon('priority')}
                      </Button>
                    </TableHead>
                  )}
                  {columnVisibility.end_date && (
                    <TableHead className="h-9 w-25 px-2">
                      <Button
                        variant="ghost"
                        className={cn(
                          '-ml-2 h-6 justify-start gap-1 px-2 font-medium text-[10px] uppercase tracking-wider transition-colors hover:bg-muted/50',
                          sortField === 'end_date'
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                        )}
                        onClick={() => handleSort('end_date')}
                      >
                        {tc('due')}
                        {getSortIcon('end_date')}
                      </Button>
                    </TableHead>
                  )}
                  {columnVisibility.assignees && (
                    <TableHead className="h-9 w-20 px-2">
                      <Button
                        variant="ghost"
                        className={cn(
                          '-ml-2 h-6 justify-start gap-1 px-2 font-medium text-[10px] uppercase tracking-wider transition-colors hover:bg-muted/50',
                          sortField === 'assignees'
                            ? 'text-foreground'
                            : 'text-muted-foreground'
                        )}
                        onClick={() => handleSort('assignees')}
                      >
                        {tc('assignee')}
                        {getSortIcon('assignees')}
                      </Button>
                    </TableHead>
                  )}
                  {columnVisibility.actions && (
                    <TableHead className="h-9 w-7.5 px-2" />
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedTasks.map((task) => {
                  const taskList = getTaskList(task);
                  const taskDueDateVisible = shouldShowTaskDueDate({
                    completedAt: task.completed_at,
                    closedAt: task.closed_at,
                    dueDate: task.end_date,
                    listStatus: taskList?.status,
                    showReviewDueDates,
                  });
                  const taskIsPastDue = Boolean(
                    task.end_date &&
                      isPast(new Date(task.end_date)) &&
                      taskDueDateVisible
                  );
                  const isExternalSource = Boolean(
                    task.source_board_id && task.source_board_id !== boardId
                  );
                  const sourceLabel =
                    task.source_board_name ??
                    task.source_workspace_name ??
                    t('ws-tasks.external_task');

                  return (
                    <TableRow
                      key={task.id}
                      className={cn(
                        'group h-11 cursor-pointer border-b transition-all duration-200',
                        'hover:bg-muted/50 hover:shadow-sm',
                        task.closed_at && 'opacity-60 saturate-50',
                        selectedTasks.has(task.id) &&
                          'bg-linear-to-r from-primary/10 via-primary/5 to-transparent shadow-sm ring-1 ring-primary/20',
                        taskIsPastDue &&
                          'border-l-2 border-l-dynamic-red/70 bg-dynamic-red/5'
                      )}
                      onClick={(e) => {
                        if (
                          (e.target as HTMLElement).closest(
                            'input[type="checkbox"], button'
                          )
                        ) {
                          return;
                        }
                        openTaskFromRow(task);
                      }}
                      onContextMenu={(e) => {
                        if (
                          e.shiftKey &&
                          !e.metaKey &&
                          !e.ctrlKey &&
                          !e.altKey
                        ) {
                          e.preventDefault();
                          handleSelectTask(
                            task.id,
                            !selectedTasks.has(task.id)
                          );
                          return;
                        }

                        e.preventDefault();
                        e.stopPropagation();
                        setOpenTaskMenu({
                          taskId: task.id,
                          point: { x: e.clientX, y: e.clientY },
                        });
                      }}
                    >
                      <TableCell className="px-2.5 py-0">
                        <Checkbox
                          checked={selectedTasks.has(task.id)}
                          onCheckedChange={(checked) =>
                            handleSelectTask(task.id, !!checked)
                          }
                          aria-label={`Select task ${task.name}`}
                          className="h-3.5 w-3.5"
                        />
                      </TableCell>
                      {columnVisibility.status && (
                        <TableCell className="px-2 py-0 text-center">
                          {renderTaskStatus(task)}
                        </TableCell>
                      )}
                      {columnVisibility.name && (
                        <TableCell className="px-2 py-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'truncate text-sm',
                                task.completed_at &&
                                  'text-muted-foreground line-through'
                              )}
                            >
                              {task.name}
                            </span>
                            {isExternalSource && (
                              <Badge
                                variant="secondary"
                                className="h-5 max-w-45 gap-1 border border-dynamic-cyan/30 bg-dynamic-cyan/10 px-1.5 text-[10px] text-dynamic-cyan"
                                title={[
                                  task.source_workspace_name,
                                  task.source_board_name,
                                  task.source_list_name,
                                ]
                                  .filter(Boolean)
                                  .join(' / ')}
                              >
                                <ExternalLink className="h-3 w-3 shrink-0" />
                                <span className="truncate">{sourceLabel}</span>
                              </Badge>
                            )}
                            {task.labels && task.labels.length > 0 && (
                              <div className="flex items-center gap-1">
                                {task.labels.slice(0, 2).map((label) => (
                                  <Badge
                                    key={label.id}
                                    variant="outline"
                                    style={(() => {
                                      const styles =
                                        computeAccessibleLabelStyles(
                                          label.color,
                                          isDark
                                        );
                                      return styles
                                        ? {
                                            backgroundColor: styles.bg,
                                            borderColor: styles.border,
                                            color: styles.text,
                                          }
                                        : undefined;
                                    })()}
                                    className="h-4 px-1.5 text-[10px]"
                                  >
                                    {label.name}
                                  </Badge>
                                ))}
                                {task.labels.length > 2 && (
                                  <span className="text-muted-foreground text-xs">
                                    +{task.labels.length - 2}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                      )}
                      {columnVisibility.priority && (
                        <TableCell className="px-2 py-0">
                          {task.priority && (
                            <Badge
                              variant="secondary"
                              className={cn(
                                'h-5 border p-1 font-medium text-[10px] transition-all',
                                task.priority === 'critical' &&
                                  'border-dynamic-red/50 bg-dynamic-red/20 text-dynamic-red shadow-dynamic-red/20 shadow-sm',
                                task.priority === 'high' &&
                                  'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange',
                                task.priority === 'normal' &&
                                  'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow',
                                task.priority === 'low' &&
                                  'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue'
                              )}
                            >
                              {task.priority === 'critical' && (
                                <Icon
                                  iconNode={unicornHead}
                                  className="h-3 w-3"
                                />
                              )}
                              {task.priority === 'high' && (
                                <Icon
                                  iconNode={horseHead}
                                  className="h-3 w-3"
                                />
                              )}
                              {task.priority === 'normal' && (
                                <Rabbit className="h-3 w-3" />
                              )}
                              {task.priority === 'low' && (
                                <Turtle className="h-3 w-3" />
                              )}
                            </Badge>
                          )}
                        </TableCell>
                      )}
                      {columnVisibility.end_date && (
                        <TableCell className="px-2 py-0">
                          {taskDueDateVisible && task.end_date && (
                            <div className="flex items-center gap-1.5">
                              <span
                                className={cn(
                                  'font-medium text-xs transition-colors',
                                  taskIsPastDue
                                    ? 'text-dynamic-red'
                                    : 'text-muted-foreground'
                                )}
                              >
                                {formatDate(task.end_date)}
                              </span>
                              {taskIsPastDue && (
                                <Badge className="h-4 bg-dynamic-red px-1 text-[9px] text-white">
                                  {tc('overdue')}
                                </Badge>
                              )}
                            </div>
                          )}
                        </TableCell>
                      )}
                      {columnVisibility.assignees && (
                        <TableCell className="px-2 py-0">
                          {task.assignees && task.assignees.length > 0 && (
                            <div className="flex -space-x-1">
                              {task.assignees.slice(0, 2).map((assignee) => (
                                <div
                                  key={assignee.id}
                                  className="relative inline-flex h-5 w-5 items-center justify-center overflow-hidden rounded-full border border-background bg-muted"
                                  title={
                                    assignee.display_name ||
                                    assignee.email ||
                                    'User'
                                  }
                                >
                                  {assignee.avatar_url ? (
                                    <Image
                                      src={assignee.avatar_url}
                                      alt={
                                        assignee.display_name ||
                                        assignee.email ||
                                        'User'
                                      }
                                      width={20}
                                      height={20}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <span className="text-[9px]">
                                      {(assignee.display_name ||
                                        assignee.email ||
                                        '?')[0]?.toUpperCase()}
                                    </span>
                                  )}
                                </div>
                              ))}
                              {task.assignees.length > 2 && (
                                <span className="ml-1 text-muted-foreground text-xs">
                                  +{task.assignees.length - 2}
                                </span>
                              )}
                            </div>
                          )}
                        </TableCell>
                      )}
                      {columnVisibility.actions && (
                        <TableCell className="px-2 py-0">
                          <TaskRowActionsMenu
                            task={task}
                            boardId={boardId}
                            workspaceId={workspaceId}
                            lists={lists}
                            isPersonalWorkspace={isPersonalWorkspace}
                            canUseBoardAssignees={showAssignees}
                            assigneeMemberSource={effectiveAssigneeMemberSource}
                            onUpdate={() => {
                              void queryClient.invalidateQueries({
                                queryKey: ['tasks', boardId],
                              });
                              void queryClient.invalidateQueries({
                                queryKey: ['tasks-full', boardId],
                              });
                            }}
                            open={openTaskMenu?.taskId === task.id}
                            onOpenChange={(open) =>
                              setOpenTaskMenu(open ? { taskId: task.id } : null)
                            }
                            contextMenuPoint={
                              openTaskMenu?.taskId === task.id
                                ? openTaskMenu.point
                                : null
                            }
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                                onClick={(event) => event.stopPropagation()}
                              >
                                <MoreHorizontal className="h-3 w-3" />
                                <span className="sr-only">
                                  {tc('open_menu')}
                                </span>
                              </Button>
                            }
                          />
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TooltipProvider>

          {/* Infinite scroll loading indicator */}
          {hasMore && (
            <div className="flex items-center justify-center border-t bg-linear-to-b from-background to-muted/20 py-4">
              <div className="flex items-center gap-2.5 rounded-lg border bg-background px-4 py-2 shadow-sm">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <span className="font-medium text-muted-foreground text-xs">
                  {tc('loading_more_tasks')}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bulk Actions for Selected Tasks */}
      {selectedTasks.size > 0 && (
        <div className="slide-in-from-bottom-4 fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 transform animate-in items-center gap-3 rounded-lg border bg-background p-4 shadow-xl backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <CheckCircle2 className="h-4 w-4 text-primary" />
            </div>
            <span className="font-semibold text-sm">
              {selectedTasks.size} {tc('task_header')}
              {selectedTasks.size !== 1 ? 's' : ''} {tc('selected')}
            </span>
          </div>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex items-center gap-2">
            {/* Bulk Actions Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={bulkWorking}
                >
                  {tc('bulk_actions')}
                  <ChevronDown className="ml-1.5 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {/* Due Date Menu */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Calendar className="mr-2 h-4 w-4 text-dynamic-purple" />
                    {tc('due_date')}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdateDueDate('today')}
                      className="cursor-pointer"
                    >
                      <Calendar className="mr-2 h-4 w-4 text-dynamic-green" />
                      {tc('today')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdateDueDate('tomorrow')}
                      className="cursor-pointer"
                    >
                      <Calendar className="mr-2 h-4 w-4 text-dynamic-blue" />
                      {tc('tomorrow')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdateDueDate('this_week')}
                      className="cursor-pointer"
                    >
                      <Calendar className="mr-2 h-4 w-4 text-dynamic-purple" />
                      {tc('this_week')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdateDueDate('next_week')}
                      className="cursor-pointer"
                    >
                      <Calendar className="mr-2 h-4 w-4 text-dynamic-orange" />
                      {tc('next_week')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdateDueDate('clear')}
                      className="cursor-pointer text-muted-foreground"
                    >
                      <X className="mr-2 h-4 w-4" />
                      {tc('remove_due_date')}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                {/* Priority Menu */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Icon
                      iconNode={unicornHead}
                      className="mr-2 h-4 w-4 text-dynamic-red"
                    />
                    {tc('priority')}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdatePriority('critical')}
                      className="cursor-pointer"
                    >
                      <Icon
                        iconNode={unicornHead}
                        className="mr-2 h-4 w-4 text-dynamic-red"
                      />
                      {t('tasks.priority_critical')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdatePriority('high')}
                      className="cursor-pointer"
                    >
                      <Icon
                        iconNode={horseHead}
                        className="mr-2 h-4 w-4 text-dynamic-orange"
                      />
                      {t('tasks.priority_high')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdatePriority('normal')}
                      className="cursor-pointer"
                    >
                      <Rabbit className="mr-2 h-4 w-4 text-dynamic-yellow" />
                      {t('tasks.priority_normal')}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdatePriority('low')}
                      className="cursor-pointer"
                    >
                      <Turtle className="mr-2 h-4 w-4 text-dynamic-blue" />
                      {t('tasks.priority_low')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={bulkWorking}
                      onClick={() => bulkUpdatePriority(null)}
                      className="cursor-pointer text-muted-foreground"
                    >
                      <X className="mr-2 h-4 w-4" />
                      {t('tasks.priority_none')}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                <DropdownMenuSeparator />

                {/* Delete Option */}
                <DropdownMenuItem
                  disabled={bulkWorking}
                  onClick={handleBulkDelete}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <X className="mr-2 h-4 w-4" />
                  {tc('delete')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedTasks(new Set())}
              className="h-8"
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              {tc('cancel')}
            </Button>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog
        open={showBulkDeleteDialog}
        onOpenChange={setShowBulkDeleteDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tc('delete_selected_tasks')}</AlertDialogTitle>
            <AlertDialogDescription>
              {tc('delete_selected_tasks_confirmation', {
                count: selectedTasks.size,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">{tc('cancel')}</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                onClick={(e) => {
                  e.preventDefault();
                  handleBulkDeleteConfirmed();
                }}
                disabled={bulkWorking}
              >
                {tc('delete')}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
