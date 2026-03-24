'use client';

import { useMutation } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  CalendarDays,
  Clock,
  Crosshair,
  Expand,
  GripHorizontal,
  Pencil,
  Plus,
  Trash2,
  ZoomIn,
} from '@tuturuuu/icons';
import {
  deleteWorkspaceTask,
  updateWorkspaceTask,
} from '@tuturuuu/internal-api';
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
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Slider } from '@tuturuuu/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { useLocale, useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '../../../context-menu';
import { useTaskDialog } from '../../hooks/useTaskDialog';
import { TaskEditDialog } from './timeline/task-edit-dialog';
import {
  buildTimelineModel,
  computeTimelineSpans,
  deriveDraftRange,
  getWeekNumber,
  pixelToDayDelta,
  type TimelineInteractionMode,
} from './timeline/timeline-utils';

export type { TimelineGroup, TimelineItem } from './timeline/timeline-utils';
export { computeTimelineSpans, pixelToDayDelta };

export interface TimelineProps {
  tasks: Task[];
  lists: TaskList[];
  boardId?: string;
  wsId?: string;
  className?: string;
  onTaskPartialUpdate?: (taskId: string, partial: Partial<Task>) => void;
}

type Density = 'compact' | 'comfortable' | 'expanded';
interface InteractionState {
  taskId: string;
  mode: TimelineInteractionMode;
  originX: number;
  originY: number;
  originalStart: Date;
  originalEnd: Date;
  originalListId: string;
  moved: boolean;
}

interface DropPreviewState {
  taskId: string;
  listId: string;
  dayIndex: number;
}

interface VisibleDayRange {
  start: number;
  end: number;
}

const SIDEBAR_WIDTH_COMPACT = 156;
const SIDEBAR_WIDTH_EXPANDED = 212;
const MIN_DAY_WIDTH = 56;
const MAX_DAY_WIDTH = 148;
const DEFAULT_DAY_WIDTH = 80;
const HANDLE_WIDTH = 14;
const DRAG_ACTIVATION_PX = 6;
const COLLAPSED_UNSCHEDULED_PREVIEW_COUNT = 4;
const COLLAPSED_VIEWPORT_LANE_HEIGHT = 10;

function getDensityConfig(density: Density) {
  switch (density) {
    case 'compact':
      return { laneHeight: 40, barHeight: 22, laneInset: 7 };
    case 'expanded':
      return { laneHeight: 66, barHeight: 38, laneInset: 12 };
    default:
      return { laneHeight: 50, barHeight: 30, laneInset: 8 };
  }
}

function getStatusToneClasses(
  item: ReturnType<typeof buildTimelineModel>['groups'][number]['items'][number]
) {
  if (item.list?.status === 'done' || item.list?.status === 'closed') {
    return {
      bar: 'border-dynamic-green/35 bg-dynamic-green/10 text-foreground hover:bg-dynamic-green/14',
      lane: '',
      badge: 'success' as const,
    };
  }

  if (item.isOngoing) {
    return {
      bar: 'border-dynamic-blue/35 bg-dynamic-blue/10 text-foreground hover:bg-dynamic-blue/14',
      lane: '',
      badge: 'default' as const,
    };
  }

  if (item.isFuture) {
    return {
      bar: 'border-dynamic-purple/35 bg-dynamic-purple/10 text-foreground hover:bg-dynamic-purple/14',
      lane: '',
      badge: 'secondary' as const,
    };
  }

  return {
    bar: 'border-border bg-muted/35 text-foreground hover:bg-muted/45',
    lane: '',
    badge: 'outline' as const,
  };
}

function getListStatusBadgeClasses(status?: string | null) {
  switch (status) {
    case 'done':
      return 'border-dynamic-green/35 bg-dynamic-green/12 text-dynamic-green';
    case 'closed':
      return 'border-muted-foreground/25 bg-muted/40 text-muted-foreground';
    case 'active':
      return 'border-dynamic-blue/35 bg-dynamic-blue/12 text-dynamic-blue';
    case 'not_started':
      return 'border-dynamic-amber/35 bg-dynamic-amber/12 text-dynamic-amber';
    default:
      return '';
  }
}

function getListName(
  task: Task,
  lists: TaskList[],
  t: ReturnType<typeof useTranslations>
) {
  return (
    lists.find((list) => list.id === task.list_id)?.name ?? t('unknown_list')
  );
}

function getLaneBodyHeight(
  rowCount: number,
  laneHeight: number,
  laneInset: number
) {
  return Math.max(
    laneHeight + laneInset * 2,
    rowCount * laneHeight + laneInset * 2
  );
}

export function TimelineBoard({
  tasks,
  lists,
  boardId,
  wsId,
  className,
  onTaskPartialUpdate,
}: TimelineProps) {
  const t = useTranslations('common');
  const locale = useLocale();
  const activeLocale = locale.startsWith('vi') ? 'vi' : 'en';
  const scrollRef = useRef<HTMLDivElement>(null);
  const { createTask, openTask } = useTaskDialog();

  const [dayWidth, setDayWidth] = useState(DEFAULT_DAY_WIDTH);
  const [density, setDensity] = useState<Density>('comfortable');
  const [isUnscheduledPopoverOpen, setIsUnscheduledPopoverOpen] =
    useState(false);
  const [isUnscheduledExpanded, setIsUnscheduledExpanded] = useState(false);
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks);
  const [drafts, setDrafts] = useState<
    Record<string, { start: Date; end: Date }>
  >({});
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const [moveTargetListId, setMoveTargetListId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [draggedUnscheduledTaskId, setDraggedUnscheduledTaskId] = useState<
    string | null
  >(null);
  const [dropPreview, setDropPreview] = useState<DropPreviewState | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<Task | null>(null);
  const [editName, setEditName] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [visibleDayRange, setVisibleDayRange] = useState<VisibleDayRange>({
    start: 0,
    end: 0,
  });

  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  const localTasksRef = useRef(localTasks);
  const draftsRef = useRef(drafts);
  const interactionRef = useRef(interaction);
  const moveTargetListRef = useRef<string | null>(moveTargetListId);

  useEffect(() => {
    localTasksRef.current = localTasks;
  }, [localTasks]);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    interactionRef.current = interaction;
  }, [interaction]);

  useEffect(() => {
    moveTargetListRef.current = moveTargetListId;
  }, [moveTargetListId]);

  const persistTaskMutation = useMutation({
    mutationFn: async ({
      taskId,
      changes,
    }: {
      taskId: string;
      changes: Record<string, unknown>;
    }) => {
      if (!wsId) throw new Error('Workspace ID is required');
      await updateWorkspaceTask(wsId, taskId, changes as any);
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      if (!wsId) throw new Error('Workspace ID is required');
      await deleteWorkspaceTask(wsId, taskId);
    },
  });

  const tasksForModel = useMemo(() => {
    if (Object.keys(drafts).length === 0) return localTasks;

    return localTasks.map((task) => {
      const draft = drafts[task.id];
      if (!draft) return task;

      return {
        ...task,
        start_date: draft.start.toISOString(),
        end_date: draft.end.toISOString(),
      } as Task;
    });
  }, [drafts, localTasks]);

  const timeline = useMemo(
    () => buildTimelineModel(tasksForModel, lists),
    [lists, tasksForModel]
  );
  const scheduledItems = useMemo(
    () => timeline.groups.flatMap((group) => group.items),
    [timeline.groups]
  );
  const scheduledItemsById = useMemo(
    () => new Map(scheduledItems.map((item) => [item.task.id, item] as const)),
    [scheduledItems]
  );

  useEffect(() => {
    if (selectedTaskId && scheduledItemsById.has(selectedTaskId)) return;
    setSelectedTaskId(scheduledItems[0]?.task.id ?? null);
  }, [scheduledItems, scheduledItemsById, selectedTaskId]);

  const selectedItem = selectedTaskId
    ? (scheduledItemsById.get(selectedTaskId) ?? null)
    : null;
  const primaryCreateListId =
    selectedItem?.task.list_id ?? lists[0]?.id ?? null;
  const { laneHeight, barHeight, laneInset } = getDensityConfig(density);
  const isSidebarCompact = false;
  const sidebarWidth = isSidebarCompact
    ? SIDEBAR_WIDTH_COMPACT
    : SIDEBAR_WIDTH_EXPANDED;
  const timelineWidth = timeline.days.length * dayWidth;
  const layoutWidth = sidebarWidth + timelineWidth;
  const todayVisible =
    timeline.todayIndex >= 0 && timeline.todayIndex < timeline.days.length;
  const showTimelineEmptyState = timeline.scheduledCount === 0;

  const formatShortDate = useCallback(
    (date: Date) => dayjs(date).locale(activeLocale).format('MMM D'),
    [activeLocale]
  );
  const formatLongDate = useCallback(
    (date: Date) => dayjs(date).locale(activeLocale).format('MMM D, YYYY'),
    [activeLocale]
  );
  const formatWeekday = useCallback(
    (date: Date) =>
      dayjs(date)
        .locale(activeLocale)
        .format(dayWidth >= 88 ? 'ddd' : 'dd'),
    [activeLocale, dayWidth]
  );
  const formatMonthLabel = useCallback(
    (date: Date) => dayjs(date).locale(activeLocale).format('MMMM YYYY'),
    [activeLocale]
  );
  const startLabel = activeLocale === 'vi' ? 'Ngày bắt đầu' : 'Start Date';
  const endLabel = activeLocale === 'vi' ? 'Ngày kết thúc' : 'End Date';

  const openEditor = useCallback((task: Task) => {
    setEditingTaskId(task.id);
    setEditName(task.name);
    setEditStart(
      task.start_date ? dayjs(task.start_date).format('YYYY-MM-DD') : ''
    );
    setEditEnd(task.end_date ? dayjs(task.end_date).format('YYYY-MM-DD') : '');
  }, []);

  const closeEditor = useCallback(() => {
    setEditingTaskId(null);
    setEditName('');
    setEditStart('');
    setEditEnd('');
  }, []);

  const clearDraft = useCallback((taskId: string) => {
    setDrafts((previous) => {
      if (!previous[taskId]) return previous;
      const next = { ...previous };
      delete next[taskId];
      return next;
    });
  }, []);

  const commitTaskChanges = useCallback(
    async ({
      taskId,
      localChanges,
      dbChanges,
      clearDraftState = true,
    }: {
      taskId: string;
      localChanges: Partial<Task>;
      dbChanges?: Record<string, unknown>;
      clearDraftState?: boolean;
    }) => {
      const previousTask = localTasksRef.current.find(
        (task) => task.id === taskId
      );
      if (!previousTask) return;

      if (clearDraftState) {
        clearDraft(taskId);
      }

      setLocalTasks((previous) =>
        previous.map((task) =>
          task.id === taskId ? ({ ...task, ...localChanges } as Task) : task
        )
      );
      onTaskPartialUpdate?.(taskId, localChanges);

      try {
        await persistTaskMutation.mutateAsync({
          taskId,
          changes: dbChanges ?? localChanges,
        });
      } catch (error) {
        console.error('Failed to persist timeline task change', error);
        setLocalTasks((previous) =>
          previous.map((task) => (task.id === taskId ? previousTask : task))
        );
        onTaskPartialUpdate?.(taskId, previousTask);
      }
    },
    [clearDraft, onTaskPartialUpdate, persistTaskMutation]
  );

  const updateDraftForInteraction = useCallback(
    (state: InteractionState, dayDelta: number) => {
      const task = localTasksRef.current.find(
        (candidate) => candidate.id === state.taskId
      );
      if (!task) return;

      const nextRange = deriveDraftRange({
        task,
        mode: state.mode,
        dayDelta,
        originalStart: state.originalStart,
        originalEnd: state.originalEnd,
      });

      setDrafts((previous) => ({
        ...previous,
        [state.taskId]: nextRange,
      }));
    },
    []
  );

  useEffect(() => {
    if (!interaction) return;

    const handlePointerMove = (event: PointerEvent) => {
      const active = interactionRef.current;
      if (!active) return;

      const deltaPx = event.clientX - active.originX;
      const deltaY = event.clientY - active.originY;
      const dayDelta = pixelToDayDelta(deltaPx, dayWidth);
      const moved =
        Math.abs(deltaPx) >= DRAG_ACTIVATION_PX ||
        Math.abs(deltaY) >= DRAG_ACTIVATION_PX;

      if (moved && !active.moved) {
        const next = { ...active, moved: true };
        interactionRef.current = next;
        setInteraction(next);
      }

      if (!moved) return;
      if (active.mode === 'move') {
        const laneElement = (
          document.elementFromPoint(
            event.clientX,
            event.clientY
          ) as HTMLElement | null
        )?.closest<HTMLElement>('[data-timeline-lane]');
        const nextListId =
          laneElement?.dataset.timelineLane &&
          laneElement.dataset.timelineLane !== 'unknown-list'
            ? laneElement.dataset.timelineLane
            : null;
        setMoveTargetListId(nextListId);
      }
      updateDraftForInteraction(active, dayDelta);
    };

    const handlePointerUp = async () => {
      const active = interactionRef.current;
      if (!active) return;

      interactionRef.current = null;
      setInteraction(null);
      const targetListId = moveTargetListRef.current;
      setMoveTargetListId(null);
      setSelectedTaskId(active.taskId);

      const draft = draftsRef.current[active.taskId];
      if (!active.moved || !draft) {
        clearDraft(active.taskId);
        return;
      }

      const didChangeDates = !(
        draft.start.getTime() === active.originalStart.getTime() &&
        draft.end.getTime() === active.originalEnd.getTime()
      );
      const didChangeList =
        active.mode === 'move' &&
        !!targetListId &&
        targetListId !== active.originalListId;

      if (!didChangeDates && !didChangeList) {
        clearDraft(active.taskId);
        return;
      }

      await commitTaskChanges({
        taskId: active.taskId,
        localChanges: {
          start_date: draft.start.toISOString(),
          end_date: draft.end.toISOString(),
          ...(didChangeList ? { list_id: targetListId } : {}),
        },
      });
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [
    clearDraft,
    commitTaskChanges,
    dayWidth,
    interaction,
    updateDraftForInteraction,
  ]);

  const currentEditingTask = editingTaskId
    ? (localTasks.find((task) => task.id === editingTaskId) ?? null)
    : null;

  const handleSaveEdit = useCallback(async () => {
    const editingTask = localTasksRef.current.find(
      (task) => task.id === editingTaskId
    );
    if (!editingTask) return;

    setSavingEdit(true);

    let nextStart = editStart.trim();
    let nextEnd = editEnd.trim();

    if (nextStart && !nextEnd) nextEnd = nextStart;
    if (nextEnd && !nextStart) nextStart = nextEnd;
    if (nextStart && nextEnd && nextStart > nextEnd) {
      const temp = nextStart;
      nextStart = nextEnd;
      nextEnd = temp;
    }

    await commitTaskChanges({
      taskId: editingTask.id,
      localChanges: {
        name: editName.trim() || editingTask.name,
        start_date: nextStart ? dayjs(nextStart).toISOString() : undefined,
        end_date: nextEnd ? dayjs(nextEnd).toISOString() : undefined,
      },
      dbChanges: {
        name: editName.trim() || editingTask.name,
        start_date: nextStart ? dayjs(nextStart).toISOString() : null,
        end_date: nextEnd ? dayjs(nextEnd).toISOString() : null,
      },
    });

    setSavingEdit(false);
    closeEditor();
  }, [
    closeEditor,
    commitTaskChanges,
    editEnd,
    editingTaskId,
    editName,
    editStart,
  ]);

  const jumpToOffset = useCallback(
    (offsetDays: number, behavior: ScrollBehavior = 'smooth') => {
      const scroller = scrollRef.current;
      if (!scroller) return;

      scroller.scrollTo({
        left: Math.max(
          0,
          sidebarWidth + offsetDays * dayWidth - scroller.clientWidth / 2
        ),
        behavior,
      });
    },
    [dayWidth, sidebarWidth]
  );

  const scrollToToday = useCallback(() => {
    if (!todayVisible) return;
    jumpToOffset(timeline.todayIndex);
  }, [jumpToOffset, timeline.todayIndex, todayVisible]);

  const fitTimeline = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller || timeline.days.length === 0) return;

    const availableWidth = Math.max(
      360,
      scroller.clientWidth - sidebarWidth - 40
    );
    const next = Math.round(availableWidth / Math.max(1, timeline.days.length));
    setDayWidth(Math.max(MIN_DAY_WIDTH, Math.min(MAX_DAY_WIDTH, next)));
  }, [sidebarWidth, timeline.days.length]);

  const updateVisibleDayRange = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller || timeline.days.length === 0) {
      setVisibleDayRange({ start: 0, end: 0 });
      return;
    }

    const viewportWidth = Math.max(0, scroller.clientWidth - sidebarWidth);
    const startPx = Math.max(0, scroller.scrollLeft - sidebarWidth);
    const endPx = Math.max(startPx, startPx + viewportWidth);
    const nextStart = Math.min(
      timeline.days.length - 1,
      Math.max(0, Math.floor(startPx / dayWidth) - 1)
    );
    const nextEnd = Math.min(
      timeline.days.length - 1,
      Math.max(nextStart, Math.ceil(endPx / dayWidth) + 1)
    );

    setVisibleDayRange((current) =>
      current.start === nextStart && current.end === nextEnd
        ? current
        : { start: nextStart, end: nextEnd }
    );
  }, [dayWidth, sidebarWidth, timeline.days.length]);

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    if (todayVisible) {
      scroller.scrollLeft = Math.max(
        0,
        sidebarWidth +
          timeline.todayIndex * dayWidth -
          scroller.clientWidth / 2 +
          dayWidth / 2
      );
    }

    updateVisibleDayRange();
  }, [
    dayWidth,
    sidebarWidth,
    timeline.todayIndex,
    todayVisible,
    updateVisibleDayRange,
  ]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;

    updateVisibleDayRange();

    const handleScroll = () => {
      updateVisibleDayRange();
    };

    scroller.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);

    return () => {
      scroller.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [updateVisibleDayRange]);

  const updateDropPreview = useCallback(
    (
      taskId: string,
      listId: string,
      clientX: number,
      currentTarget: HTMLDivElement
    ) => {
      const rect = currentTarget.getBoundingClientRect();
      const rawIndex = Math.floor((clientX - rect.left) / dayWidth);
      const dayIndex = Math.min(
        timeline.days.length - 1,
        Math.max(0, Number.isFinite(rawIndex) ? rawIndex : 0)
      );

      setDropPreview({
        taskId,
        listId,
        dayIndex,
      });
    },
    [dayWidth, timeline.days.length]
  );

  const handleUnscheduledDragStart = useCallback((taskId: string) => {
    setDraggedUnscheduledTaskId(taskId);
    setDropPreview(null);
    setIsUnscheduledPopoverOpen(false);
  }, []);

  const handleUnscheduledDragEnd = useCallback(() => {
    setDraggedUnscheduledTaskId(null);
    setDropPreview(null);
  }, []);

  const handleLaneDrop = useCallback(
    async (listId: string) => {
      if (!dropPreview || dropPreview.listId !== listId) return;
      const day = timeline.days[dropPreview.dayIndex];
      if (!day) return;

      const taskId = dropPreview.taskId;
      const startAt = dayjs(day).startOf('day').toISOString();
      const endAt = dayjs(day).endOf('day').toISOString();

      setDraggedUnscheduledTaskId(null);
      setDropPreview(null);

      await commitTaskChanges({
        taskId,
        localChanges: {
          list_id: listId,
          start_date: startAt,
          end_date: endAt,
        },
      });
    },
    [commitTaskChanges, dropPreview, timeline.days]
  );

  const handleUnscheduleTask = useCallback(
    async (task: Task) => {
      await commitTaskChanges({
        taskId: task.id,
        localChanges: {
          start_date: undefined,
          end_date: undefined,
        },
        dbChanges: {
          start_date: null,
          end_date: null,
        },
      });
    },
    [commitTaskChanges]
  );

  const handleDeleteTask = useCallback(
    async (task: Task) => {
      const previousTasks = localTasksRef.current;
      clearDraft(task.id);
      setSelectedTaskId((previous) => (previous === task.id ? null : previous));
      setLocalTasks((previous) =>
        previous.filter((item) => item.id !== task.id)
      );
      onTaskPartialUpdate?.(task.id, {
        deleted_at: new Date().toISOString(),
      } as Partial<Task>);

      try {
        await deleteTaskMutation.mutateAsync(task.id);
      } catch (error) {
        console.error('Failed to delete timeline task', error);
        setLocalTasks(previousTasks);
        onTaskPartialUpdate?.(task.id, task);
      }
    },
    [clearDraft, deleteTaskMutation, onTaskPartialUpdate]
  );

  const handleMoveTaskToList = useCallback(
    async (task: Task, listId: string) => {
      if (task.list_id === listId) return;

      await commitTaskChanges({
        taskId: task.id,
        localChanges: {
          list_id: listId,
        },
      });
    },
    [commitTaskChanges]
  );

  const handleCreateTask = useCallback(
    (listId?: string | null) => {
      if (!boardId) return;
      const targetListId = listId ?? primaryCreateListId;
      if (!targetListId) return;

      createTask(boardId, targetListId, lists, undefined, {
        start_date: dayjs().startOf('day').toISOString(),
        end_date: dayjs().endOf('day').toISOString(),
      });
    },
    [boardId, createTask, lists, primaryCreateListId]
  );

  const unscheduledTasks = timeline.unscheduled;
  const canExpandUnscheduled =
    unscheduledTasks.length > COLLAPSED_UNSCHEDULED_PREVIEW_COUNT;
  const showExpandedUnscheduled =
    isUnscheduledExpanded || !canExpandUnscheduled;
  const visibleUnscheduledTasks = showExpandedUnscheduled
    ? unscheduledTasks
    : unscheduledTasks.slice(0, COLLAPSED_UNSCHEDULED_PREVIEW_COUNT);
  const hiddenUnscheduledCount = Math.max(
    0,
    unscheduledTasks.length - visibleUnscheduledTasks.length
  );
  const orderedGroups = useMemo(
    () =>
      timeline.groups
        .map((group, index) => {
          const visibleItems = group.items.filter((item) => {
            const itemEndDay = item.offsetDays + item.durationDays - 1;
            return (
              item.offsetDays <= visibleDayRange.end &&
              itemEndDay >= visibleDayRange.start
            );
          });

          return {
            group,
            index,
            visibleItems,
            isViewportCollapsed:
              !showTimelineEmptyState &&
              (group.items.length === 0 || visibleItems.length === 0),
          };
        })
        .sort((left, right) => {
          if (left.isViewportCollapsed !== right.isViewportCollapsed) {
            return (
              Number(left.isViewportCollapsed) -
              Number(right.isViewportCollapsed)
            );
          }

          return left.index - right.index;
        }),
    [
      showTimelineEmptyState,
      timeline.groups,
      visibleDayRange.end,
      visibleDayRange.start,
    ]
  );
  const firstOrderedGroupId = orderedGroups[0]?.group.id ?? null;

  return (
    <>
      <section
        className={cn(
          'flex h-full flex-col overflow-hidden rounded-xl border border-border/50',
          className
        )}
        aria-label="Timeline view"
      >
        <div className="border-border/70 border-b px-3 py-2.5 md:px-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm">
              {unscheduledTasks.length > 0 ? (
                <Popover
                  open={isUnscheduledPopoverOpen}
                  onOpenChange={(open) => {
                    setIsUnscheduledPopoverOpen(open);
                    if (open) {
                      setIsUnscheduledExpanded(true);
                    }
                  }}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1.5 transition-colors hover:bg-background"
                      title={`${timeline.scheduledCount} ${t('scheduled')}, ${unscheduledTasks.length} ${t('unscheduled')}`}
                    >
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium text-[13px]">
                        {timeline.scheduledCount}/{unscheduledTasks.length}{' '}
                        {t('scheduled')}
                      </span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    side="bottom"
                    className="w-[min(540px,calc(100vw-2rem))] rounded-2xl border border-border/70 bg-background/95 p-3 shadow-2xl backdrop-blur-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm">
                            {t('timeline_unscheduled_prompt')}
                          </p>
                          <Badge
                            variant="secondary"
                            className="rounded-full px-2 py-0.5 text-[10px]"
                          >
                            {unscheduledTasks.length}
                          </Badge>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {showTimelineEmptyState
                            ? t('timeline_drag_unscheduled')
                            : t('timeline_drop_to_schedule')}
                        </p>
                      </div>
                      {canExpandUnscheduled && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 rounded-full px-2.5 text-[11px] text-muted-foreground"
                          onClick={() =>
                            setIsUnscheduledExpanded((previous) => !previous)
                          }
                        >
                          {showExpandedUnscheduled ? t('compact') : t('expand')}
                        </Button>
                      )}
                    </div>

                    <div
                      className={cn(
                        'mt-3 min-w-0',
                        showExpandedUnscheduled
                          ? 'grid max-h-72 grid-cols-1 gap-2 overflow-auto pr-1 sm:grid-cols-2'
                          : 'flex gap-2 overflow-x-auto pb-1'
                      )}
                    >
                      {visibleUnscheduledTasks.map((task) => (
                        <button
                          key={task.id}
                          type="button"
                          draggable
                          className={cn(
                            'group flex items-start gap-2 rounded-xl border border-border/60 bg-background/95 text-left shadow-xs transition-all hover:border-dynamic-blue/35 hover:bg-background',
                            showExpandedUnscheduled
                              ? 'w-full p-2'
                              : 'min-w-[148px] max-w-[176px] shrink-0 p-1.5',
                            draggedUnscheduledTaskId === task.id && 'opacity-40'
                          )}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/plain', task.id);
                            handleUnscheduledDragStart(task.id);
                          }}
                          onDragEnd={handleUnscheduledDragEnd}
                          onClick={() => openEditor(task)}
                        >
                          <div className="mt-0.5 rounded-full border border-border/60 bg-muted/40 p-1 text-muted-foreground transition-colors group-hover:text-foreground">
                            <GripHorizontal className="h-3 w-3" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <span className="line-clamp-2 font-medium text-xs leading-4">
                                {task.name}
                              </span>
                              <Badge
                                variant="outline"
                                className="shrink-0 rounded-full px-1.5 text-[9px]"
                              >
                                {getListName(task, lists, t)}
                              </Badge>
                            </div>
                            {showExpandedUnscheduled && (
                              <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                                <span>{t('timeline_drop_to_schedule')}</span>
                              </div>
                            )}
                          </div>
                        </button>
                      ))}
                      {!showExpandedUnscheduled &&
                        hiddenUnscheduledCount > 0 && (
                          <div className="flex min-w-[72px] shrink-0 items-center justify-center rounded-xl border border-border/70 border-dashed bg-background/70 px-2 py-1.5 text-center text-[10px] text-muted-foreground">
                            +{hiddenUnscheduledCount}
                          </div>
                        )}
                    </div>
                  </PopoverContent>
                </Popover>
              ) : (
                <span
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1.5"
                  title={`${timeline.scheduledCount} ${t('scheduled')}`}
                >
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium text-[13px]">
                    {timeline.scheduledCount} {t('scheduled')}
                  </span>
                </span>
              )}
              <span className="hidden rounded-full border border-border bg-background/50 px-3 py-1.5 text-muted-foreground xl:inline-flex">
                {formatLongDate(timeline.rangeStart)} -{' '}
                {formatLongDate(timeline.rangeEnd)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 shrink-0 rounded-full"
                onClick={() => handleCreateTask()}
                disabled={!boardId || !primaryCreateListId}
                aria-label={t('new')}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-2 px-2.5"
                onClick={scrollToToday}
              >
                <Crosshair className="h-3.5 w-3.5" />
                {t('today')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-2 px-2.5"
                onClick={fitTimeline}
              >
                <Expand className="h-3.5 w-3.5" />
                {t('timeline_fit_view')}
              </Button>
              <div className="flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1.5">
                <ZoomIn className="h-3.5 w-3.5 text-muted-foreground" />
                <Slider
                  className="w-24"
                  min={MIN_DAY_WIDTH}
                  max={MAX_DAY_WIDTH}
                  step={4}
                  value={[dayWidth]}
                  onValueChange={(value) =>
                    setDayWidth(value[0] ?? DEFAULT_DAY_WIDTH)
                  }
                  aria-label={t('timeline_zoom')}
                />
                <span className="w-10 text-right font-medium text-[11px]">
                  {dayWidth}px
                </span>
              </div>
              <div className="flex items-center rounded-full border border-border bg-background/70 p-1">
                {(['compact', 'comfortable', 'expanded'] as const).map(
                  (option) => (
                    <Button
                      key={option}
                      size="sm"
                      variant="ghost"
                      className={cn(
                        'h-7 rounded-full px-2.5 text-[11px] transition-colors',
                        density === option
                          ? 'bg-foreground text-background hover:bg-foreground/90 hover:text-background'
                          : 'text-muted-foreground hover:bg-background/70 hover:text-foreground'
                      )}
                      onClick={() => setDensity(option)}
                    >
                      {t(option)}
                    </Button>
                  )
                )}
              </div>
            </div>
          </div>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
          <div style={{ width: layoutWidth, minHeight: '100%' }}>
            <div
              className="sticky top-0 z-10 grid border-border/70 border-b bg-background/90 backdrop-blur-sm"
              style={{
                gridTemplateColumns: `${sidebarWidth}px ${timelineWidth}px`,
              }}
            >
              <div className="sticky left-0 z-20 border-border/70 border-r bg-background px-4 py-3">
                <div className="font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]">
                  {t('tasks')}
                </div>
              </div>
              <div>
                <div className="flex h-8 border-border/60 border-b">
                  {timeline.monthSegments.map((segment) => (
                    <div
                      key={segment.key}
                      className="flex items-center border-border/60 border-r px-3 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.18em]"
                      style={{ width: segment.days * dayWidth }}
                    >
                      {formatMonthLabel(segment.start)}
                    </div>
                  ))}
                </div>
                <div className="flex h-12">
                  {timeline.days.map((day, index) => {
                    const isToday = index === timeline.todayIndex;
                    const isWeekend = [0, 6].includes(dayjs(day).day());
                    const isWeekStart = dayjs(day).day() === 1;

                    return (
                      <div
                        key={`${day.toISOString()}-${index}`}
                        className={cn(
                          'relative flex flex-col items-center justify-center border-border/60 border-r text-[11px]',
                          isWeekend && 'bg-muted/20',
                          isWeekStart && 'border-l border-l-border/70',
                          isToday && 'bg-dynamic-blue/8 text-dynamic-blue'
                        )}
                        style={{ width: dayWidth }}
                      >
                        <span className="font-medium uppercase">
                          {formatWeekday(day)}
                        </span>
                        <span className="text-xs">{dayjs(day).date()}</span>
                        {dayWidth >= 92 && isWeekStart && (
                          <span className="mt-0.5 text-[9px] text-muted-foreground uppercase tracking-[0.16em]">
                            W{getWeekNumber(day)}
                          </span>
                        )}
                        {isToday && (
                          <span className="absolute inset-x-2 bottom-1 h-0.5 rounded-full bg-dynamic-blue" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {orderedGroups.map(
              ({ group, isViewportCollapsed, visibleItems }) => {
                const groupId = group.id;
                const groupList = group.list;
                const isPreviewGroup = dropPreview?.listId === groupId;
                const isMoveTargetGroup = moveTargetListId === groupList?.id;
                const showEmptyLane = group.items.length === 0;
                const laneBodyHeight = getLaneBodyHeight(
                  group.rowCount,
                  laneHeight,
                  laneInset
                );
                const selectedGroupItem =
                  group.items.find((item) => item.task.id === selectedTaskId) ??
                  null;
                const previewItems = visibleItems.slice(0, 3);
                const overflowCount = Math.max(0, visibleItems.length - 3);
                const showLaneEmptyHint =
                  showTimelineEmptyState && firstOrderedGroupId === groupId;
                const summaryTone = selectedGroupItem
                  ? getStatusToneClasses(selectedGroupItem)
                  : group.items[0]
                    ? getStatusToneClasses(group.items[0])
                    : null;

                return (
                  <div key={groupId}>
                    <div
                      className="grid border-border/60 border-b"
                      style={{
                        gridTemplateColumns: `${sidebarWidth}px ${timelineWidth}px`,
                      }}
                    >
                      <div
                        className={cn(
                          'sticky left-0 isolate z-20 overflow-hidden border-border/60 border-r bg-background shadow-[14px_0_24px_-24px_rgba(0,0,0,0.95)]',
                          isViewportCollapsed
                            ? 'px-4 py-1.5'
                            : isSidebarCompact
                              ? 'px-2.5 py-2'
                              : 'px-4 py-2.5'
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                'max-w-full truncate',
                                getListStatusBadgeClasses(groupList?.status)
                              )}
                            >
                              {groupList?.name ?? t('unknown_list')}
                            </Badge>
                            <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-[10px] text-muted-foreground">
                              {group.items.length}
                            </span>
                          </div>
                          {groupList && boardId && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className={cn(
                                'shrink-0',
                                isViewportCollapsed ? 'h-6 w-6' : 'h-7 w-7'
                              )}
                              onClick={() => handleCreateTask(groupList.id)}
                              aria-label={`${t('new')} ${groupList.name}`}
                            >
                              <Plus
                                className={cn(
                                  isViewportCollapsed
                                    ? 'h-3 w-3'
                                    : 'h-3.5 w-3.5'
                                )}
                              />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div
                        className={cn(
                          'relative',
                          isViewportCollapsed ? 'h-9' : 'h-12'
                        )}
                      >
                        {todayVisible && (
                          <div
                            className="pointer-events-none absolute inset-y-0 border-dynamic-blue/40 border-l"
                            style={{
                              left:
                                timeline.todayIndex * dayWidth + dayWidth / 2,
                            }}
                          />
                        )}
                      </div>
                    </div>

                    <div
                      className="grid"
                      style={{
                        gridTemplateColumns: `${sidebarWidth}px ${timelineWidth}px`,
                      }}
                    >
                      <div
                        className={cn(
                          'sticky left-0 isolate z-10 overflow-hidden border-border/60 border-r bg-background shadow-[14px_0_24px_-24px_rgba(0,0,0,0.95)]',
                          isViewportCollapsed
                            ? 'px-4 py-1'
                            : isSidebarCompact
                              ? 'px-2 py-2'
                              : 'px-4 py-3'
                        )}
                        style={{
                          minHeight: isViewportCollapsed
                            ? COLLAPSED_VIEWPORT_LANE_HEIGHT
                            : laneBodyHeight,
                        }}
                      >
                        {!showEmptyLane && !isViewportCollapsed && (
                          <div
                            className={cn(
                              'rounded-2xl border shadow-xs transition-colors',
                              isSidebarCompact ? 'px-2.5 py-2.5' : 'px-3 py-3',
                              selectedGroupItem
                                ? 'border-dynamic-blue/30 bg-dynamic-blue/8'
                                : summaryTone
                                  ? 'border-border/50 bg-background/40'
                                  : 'border-border/40 bg-background/20'
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-[10px] text-muted-foreground">
                                    {group.items.length} {t('scheduled')}
                                  </span>
                                  {selectedGroupItem?.task.priority && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] uppercase"
                                    >
                                      {selectedGroupItem.task.priority}
                                    </Badge>
                                  )}
                                </div>
                                {!selectedGroupItem &&
                                  previewItems.length > 0 && (
                                    <p className="mt-2 text-[11px] text-muted-foreground">
                                      {formatShortDate(previewItems[0]!.start)}{' '}
                                      -{' '}
                                      {formatShortDate(
                                        previewItems[previewItems.length - 1]!
                                          .end
                                      )}
                                    </p>
                                  )}
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {previewItems.map((item) => (
                                <button
                                  key={item.task.id}
                                  type="button"
                                  className={cn(
                                    'max-w-full rounded-full border px-2 py-1 text-left text-[11px] transition-colors',
                                    selectedTaskId === item.task.id
                                      ? 'border-dynamic-blue/40 bg-dynamic-blue/10 text-foreground'
                                      : 'border-border/60 bg-background/70 text-muted-foreground hover:text-foreground'
                                  )}
                                  onClick={() =>
                                    setSelectedTaskId(item.task.id)
                                  }
                                >
                                  <span className="block truncate">
                                    {item.task.name}
                                  </span>
                                </button>
                              ))}
                              {overflowCount > 0 && (
                                <span className="rounded-full border border-border/60 border-dashed px-2 py-1 text-[11px] text-muted-foreground">
                                  +{overflowCount}
                                </span>
                              )}
                            </div>

                            {selectedGroupItem && (
                              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                <span>
                                  {formatShortDate(selectedGroupItem.start)} -{' '}
                                  {formatShortDate(selectedGroupItem.end)}
                                </span>
                                <span>{selectedGroupItem.durationDays}d</span>
                              </div>
                            )}
                            {isSidebarCompact &&
                              !selectedGroupItem &&
                              !showEmptyLane && (
                                <div className="mt-2 text-[10px] text-muted-foreground">
                                  {previewItems[0]
                                    ? formatShortDate(previewItems[0].start)
                                    : null}
                                </div>
                              )}
                          </div>
                        )}
                      </div>

                      <div
                        className={cn(
                          'relative overflow-hidden border-border/60 border-b',
                          showEmptyLane ? 'bg-muted/5' : '',
                          isMoveTargetGroup && 'bg-dynamic-blue/6',
                          isPreviewGroup && 'bg-muted/10'
                        )}
                        data-timeline-lane={groupList?.id ?? groupId}
                        style={{
                          minHeight: isViewportCollapsed
                            ? COLLAPSED_VIEWPORT_LANE_HEIGHT
                            : laneBodyHeight,
                        }}
                        onDragOver={(event) => {
                          const taskId =
                            draggedUnscheduledTaskId ||
                            event.dataTransfer.getData('text/plain');
                          if (!taskId) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = 'move';
                          updateDropPreview(
                            taskId,
                            groupId,
                            event.clientX,
                            event.currentTarget
                          );
                        }}
                        onDragLeave={(event) => {
                          if (
                            !event.currentTarget.contains(
                              event.relatedTarget as Node | null
                            )
                          ) {
                            setDropPreview((previous) =>
                              previous?.listId === groupId ? null : previous
                            );
                          }
                        }}
                        onDrop={async (event) => {
                          event.preventDefault();
                          await handleLaneDrop(groupId);
                        }}
                        onDoubleClick={() =>
                          showEmptyLane &&
                          groupList &&
                          handleCreateTask(groupList.id)
                        }
                      >
                        <div className="pointer-events-none absolute inset-0 flex">
                          {timeline.days.map((day, index) => (
                            <div
                              key={`${groupId}-${day.toISOString()}-${index}`}
                              className={cn(
                                'h-full border-border/50 border-r',
                                index === 0 && 'border-l border-l-border/50',
                                todayVisible &&
                                  index === timeline.todayIndex &&
                                  'bg-dynamic-blue/4'
                              )}
                              style={{ width: dayWidth }}
                            />
                          ))}
                        </div>

                        {todayVisible && (
                          <div
                            className="pointer-events-none absolute inset-y-0 z-0 border-dynamic-blue/50 border-l"
                            style={{
                              left:
                                timeline.todayIndex * dayWidth + dayWidth / 2,
                            }}
                          />
                        )}

                        {dropPreview?.listId === groupId &&
                          (() => {
                            const previewTask = localTasks.find(
                              (task) => task.id === dropPreview.taskId
                            );
                            if (!previewTask) return null;

                            return (
                              <div
                                className="pointer-events-none absolute z-20 rounded-lg border border-dynamic-blue/60 border-dashed bg-background/95 px-2 py-1 shadow-sm"
                                style={{
                                  top:
                                    laneInset +
                                    Math.max(0, (laneHeight - 28) / 2),
                                  left: dropPreview.dayIndex * dayWidth + 4,
                                  width: Math.max(dayWidth - 8, 44),
                                }}
                              >
                                <p className="truncate font-medium text-[11px]">
                                  {previewTask.name}
                                </p>
                              </div>
                            );
                          })()}

                        {showLaneEmptyHint && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="rounded-full border border-border/60 border-dashed bg-background/85 px-3 py-1.5 text-[11px] text-muted-foreground shadow-xs">
                              {t('timeline_drag_unscheduled')}
                            </div>
                          </div>
                        )}

                        {group.items.map((item) => {
                          const tone = getStatusToneClasses(item);
                          const isSelected = selectedTaskId === item.task.id;
                          const barWidth = Math.max(
                            item.durationDays * dayWidth - 8,
                            dayWidth - 8
                          );
                          const showDurationPill = barWidth >= 112;
                          const showBarDates =
                            dayWidth >= 104 && barWidth >= 180;
                          const top =
                            laneInset +
                            item.rowIndex * laneHeight +
                            Math.max(0, (laneHeight - barHeight) / 2);

                          return (
                            <ContextMenu key={item.task.id}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <ContextMenuTrigger asChild>
                                    <div
                                      className={cn(
                                        'group absolute z-1 rounded-2xl border shadow-[0_10px_24px_-18px_rgba(0,0,0,0.85)] backdrop-blur-sm',
                                        tone.bar,
                                        isSelected &&
                                          'ring-2 ring-dynamic-blue/35'
                                      )}
                                      style={{
                                        top,
                                        left: item.offsetDays * dayWidth + 4,
                                        width: barWidth,
                                        height: barHeight,
                                      }}
                                    >
                                      <button
                                        type="button"
                                        className="absolute inset-y-1.5 left-1 flex cursor-ew-resize touch-none items-center justify-center rounded-full bg-background/50 px-2 text-muted-foreground opacity-80 transition-all hover:bg-background/80 hover:text-foreground group-hover:opacity-100"
                                        style={{ width: HANDLE_WIDTH }}
                                        aria-label={`Resize ${item.task.name} start`}
                                        onPointerDown={(event) => {
                                          if (event.button !== 0) return;
                                          event.preventDefault();
                                          event.stopPropagation();
                                          setSelectedTaskId(item.task.id);
                                          setInteraction({
                                            taskId: item.task.id,
                                            mode: 'resize-start',
                                            originX: event.clientX,
                                            originY: event.clientY,
                                            originalStart: item.start,
                                            originalEnd: item.end,
                                            originalListId: item.task.list_id,
                                            moved: false,
                                          });
                                        }}
                                      >
                                        <span className="h-5 w-1 rounded-full bg-border/70" />
                                      </button>

                                      <button
                                        type="button"
                                        className="absolute inset-y-0 flex cursor-grab touch-none select-none items-center gap-2 px-3 text-left active:cursor-grabbing"
                                        style={{
                                          left: HANDLE_WIDTH,
                                          right: HANDLE_WIDTH,
                                        }}
                                        onPointerDown={(event) => {
                                          if (event.button !== 0) return;
                                          event.preventDefault();
                                          setSelectedTaskId(item.task.id);
                                          setInteraction({
                                            taskId: item.task.id,
                                            mode: 'move',
                                            originX: event.clientX,
                                            originY: event.clientY,
                                            originalStart: item.start,
                                            originalEnd: item.end,
                                            originalListId: item.task.list_id,
                                            moved: false,
                                          });
                                        }}
                                        onDoubleClick={() =>
                                          openEditor(item.task)
                                        }
                                      >
                                        <GripHorizontal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-1.5">
                                            <span className="truncate font-semibold text-sm">
                                              {item.task.name}
                                            </span>
                                            {showDurationPill && (
                                              <span className="rounded-full border border-border/50 bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground">
                                                {item.durationDays}d
                                              </span>
                                            )}
                                          </div>
                                          {showBarDates && (
                                            <div className="mt-0.5 text-[11px] text-muted-foreground">
                                              {formatShortDate(item.start)} -{' '}
                                              {formatShortDate(item.end)}
                                            </div>
                                          )}
                                        </div>
                                      </button>

                                      <button
                                        type="button"
                                        className="absolute inset-y-1.5 right-1 flex cursor-ew-resize touch-none items-center justify-center rounded-full bg-background/50 px-2 text-muted-foreground opacity-80 transition-all hover:bg-background/80 hover:text-foreground group-hover:opacity-100"
                                        style={{ width: HANDLE_WIDTH }}
                                        aria-label={`Resize ${item.task.name} end`}
                                        onPointerDown={(event) => {
                                          if (event.button !== 0) return;
                                          event.preventDefault();
                                          event.stopPropagation();
                                          setSelectedTaskId(item.task.id);
                                          setInteraction({
                                            taskId: item.task.id,
                                            mode: 'resize-end',
                                            originX: event.clientX,
                                            originY: event.clientY,
                                            originalStart: item.start,
                                            originalEnd: item.end,
                                            originalListId: item.task.list_id,
                                            moved: false,
                                          });
                                        }}
                                      >
                                        <span className="h-5 w-1 rounded-full bg-border/70" />
                                      </button>
                                    </div>
                                  </ContextMenuTrigger>
                                </TooltipTrigger>
                                <TooltipContent
                                  side="top"
                                  align="start"
                                  className="max-w-70 rounded-xl border border-border/70 bg-background/95 px-3 py-2 shadow-lg"
                                >
                                  <div className="space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="line-clamp-2 font-semibold text-sm leading-5">
                                        {item.task.name}
                                      </p>
                                      <Badge
                                        variant="outline"
                                        className="shrink-0 rounded-full text-[10px]"
                                      >
                                        {getListName(item.task, lists, t)}
                                      </Badge>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                                      <span>
                                        {formatShortDate(item.start)} -{' '}
                                        {formatShortDate(item.end)}
                                      </span>
                                      <span>&bull;</span>
                                      <span>{item.durationDays}d</span>
                                    </div>
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                              <ContextMenuContent className="w-60">
                                <ContextMenuItem
                                  className="gap-3"
                                  onClick={() => openEditor(item.task)}
                                >
                                  <CalendarDays className="h-4 w-4" />
                                  <span className="flex-1">
                                    {t('timeline_edit_task')}
                                  </span>
                                </ContextMenuItem>
                                <ContextMenuItem
                                  className="gap-3"
                                  onClick={() =>
                                    boardId &&
                                    openTask(item.task, boardId, lists)
                                  }
                                  disabled={!boardId}
                                >
                                  <Pencil className="h-4 w-4" />
                                  <span className="flex-1">{t('edit')}</span>
                                </ContextMenuItem>
                                <ContextMenuSeparator className="my-1.5" />
                                <ContextMenuItem
                                  className="gap-3"
                                  onClick={() =>
                                    handleUnscheduleTask(item.task)
                                  }
                                >
                                  <Clock className="h-4 w-4" />
                                  <span className="flex-1">
                                    {t('timeline_remove_from_timeline')}
                                  </span>
                                </ContextMenuItem>
                                <ContextMenuSub>
                                  <ContextMenuSubTrigger className="gap-3">
                                    <ArrowLeftRight className="h-4 w-4" />
                                    <span className="flex-1">
                                      {t('timeline_move_to_list')}
                                    </span>
                                  </ContextMenuSubTrigger>
                                  <ContextMenuSubContent className="w-48">
                                    {lists.map((list) => (
                                      <ContextMenuItem
                                        key={list.id}
                                        disabled={list.id === item.task.list_id}
                                        className="gap-3"
                                        onClick={() =>
                                          handleMoveTaskToList(
                                            item.task,
                                            list.id
                                          )
                                        }
                                      >
                                        <span className="h-2 w-2 rounded-full bg-border/80" />
                                        <span className="flex-1 truncate">
                                          {list.name}
                                        </span>
                                      </ContextMenuItem>
                                    ))}
                                  </ContextMenuSubContent>
                                </ContextMenuSub>
                                <ContextMenuSeparator className="my-1.5" />
                                <ContextMenuItem
                                  variant="destructive"
                                  className="gap-3"
                                  onClick={() => setDeleteCandidate(item.task)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  <span className="flex-1">{t('delete')}</span>
                                </ContextMenuItem>
                              </ContextMenuContent>
                            </ContextMenu>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>
      </section>

      <TaskEditDialog
        open={!!currentEditingTask}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
        name={editName}
        start={editStart}
        end={editEnd}
        onNameChange={setEditName}
        onStartChange={setEditStart}
        onEndChange={setEditEnd}
        onSave={handleSaveEdit}
        saving={savingEdit}
        title={t('timeline_edit_task')}
        description={t('timeline_edit_task_description')}
        nameLabel={t('title')}
        startLabel={startLabel}
        endLabel={endLabel}
        cancelLabel={t('cancel')}
        saveLabel={t('save')}
        savingLabel={t('saving')}
        placeholder={t('title')}
      />
      <AlertDialog
        open={!!deleteCandidate}
        onOpenChange={(open) => {
          if (!open) setDeleteCandidate(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('timeline_delete_task_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('timeline_delete_task_description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async (event) => {
                event.preventDefault();
                if (!deleteCandidate) return;
                await handleDeleteTask(deleteCandidate);
                setDeleteCandidate(null);
              }}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
