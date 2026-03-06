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
import { createClient } from '@tuturuuu/supabase/next/client';
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
import { Slider } from '@tuturuuu/ui/slider';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
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
import 'dayjs/locale/vi';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

const SIDEBAR_WIDTH = 236;
const MIN_DAY_WIDTH = 56;
const MAX_DAY_WIDTH = 148;
const DEFAULT_DAY_WIDTH = 80;
const HANDLE_WIDTH = 14;
const DRAG_ACTIVATION_PX = 6;

function getDensityConfig(density: Density) {
  switch (density) {
    case 'compact':
      return { laneHeight: 56, barHeight: 32 };
    case 'expanded':
      return { laneHeight: 88, barHeight: 48 };
    default:
      return { laneHeight: 70, barHeight: 40 };
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

function getListName(
  task: Task,
  lists: TaskList[],
  t: ReturnType<typeof useTranslations>
) {
  return (
    lists.find((list) => list.id === task.list_id)?.name ?? t('unknown_list')
  );
}

export function TimelineBoard({
  tasks,
  lists,
  boardId,
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
      const supabase = createClient();
      const { error } = await supabase
        .from('tasks')
        .update(changes)
        .eq('id', taskId);

      if (error) throw error;
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      const supabase = createClient();
      const { error } = await supabase
        .from('tasks')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', taskId);

      if (error) throw error;
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
  const { laneHeight, barHeight } = getDensityConfig(density);
  const timelineWidth = timeline.days.length * dayWidth;
  const layoutWidth = SIDEBAR_WIDTH + timelineWidth;
  const todayVisible =
    timeline.todayIndex >= 0 && timeline.todayIndex < timeline.days.length;

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
          SIDEBAR_WIDTH + offsetDays * dayWidth - scroller.clientWidth / 2
        ),
        behavior,
      });
    },
    [dayWidth]
  );

  const scrollToToday = useCallback(() => {
    if (!todayVisible) return;
    jumpToOffset(timeline.todayIndex);
  }, [jumpToOffset, timeline.todayIndex, todayVisible]);

  const focusSelectedTask = useCallback(() => {
    if (!selectedItem) return;
    jumpToOffset(
      selectedItem.offsetDays + Math.floor(selectedItem.durationDays / 2)
    );
  }, [jumpToOffset, selectedItem]);

  const fitTimeline = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller || timeline.days.length === 0) return;

    const availableWidth = Math.max(
      360,
      scroller.clientWidth - SIDEBAR_WIDTH - 40
    );
    const next = Math.round(availableWidth / Math.max(1, timeline.days.length));
    setDayWidth(Math.max(MIN_DAY_WIDTH, Math.min(MAX_DAY_WIDTH, next)));
  }, [timeline.days.length]);

  useEffect(() => {
    if (!todayVisible) return;
    const scroller = scrollRef.current;
    if (!scroller) return;

    requestAnimationFrame(() => {
      scroller.scrollLeft = Math.max(
        0,
        SIDEBAR_WIDTH +
          timeline.todayIndex * dayWidth -
          scroller.clientWidth / 2 +
          dayWidth / 2
      );
    });
  }, [dayWidth, timeline.todayIndex, todayVisible]);

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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1.5">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">
                  {timeline.scheduledCount} {t('scheduled')}
                </span>
              </span>
              {unscheduledTasks.length > 0 && (
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-background/50 px-3 py-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">
                    {unscheduledTasks.length} {t('unscheduled')}
                  </span>
                </span>
              )}
              <span className="hidden rounded-full border border-border bg-background/50 px-3 py-1.5 text-muted-foreground md:inline-flex">
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
                className="h-8 gap-2 px-3"
                onClick={scrollToToday}
              >
                <Crosshair className="h-3.5 w-3.5" />
                {t('today')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-2 px-3"
                onClick={fitTimeline}
              >
                <Expand className="h-3.5 w-3.5" />
                {t('timeline_fit_view')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-2 px-3"
                onClick={focusSelectedTask}
                disabled={!selectedItem}
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
                {t('timeline_focus_selection')}
              </Button>
              <div className="flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1.5">
                <ZoomIn className="h-3.5 w-3.5 text-muted-foreground" />
                <Slider
                  className="w-28"
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
                        'h-7 rounded-full px-3 text-[11px] transition-colors',
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
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span>{t('timeline_help_drag')}</span>
            <span>{t('timeline_help_resize')}</span>
            <span>{t('timeline_help_double_click')}</span>
          </div>
        </div>

        {unscheduledTasks.length > 0 && (
          <div className="border-border/60 border-b px-3 py-2.5 md:px-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-sm">
                  {t('timeline_unscheduled_prompt')}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t('timeline_drag_unscheduled')}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {unscheduledTasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  draggable
                  className={cn(
                    'inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-left shadow-xs transition-colors',
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
                  <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium text-sm">{task.name}</span>
                  <Badge variant="outline">{getListName(task, lists, t)}</Badge>
                </button>
              ))}
            </div>
          </div>
        )}

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
          <div style={{ width: layoutWidth, minHeight: '100%' }}>
            <div
              className="sticky top-0 z-30 grid border-border/70 border-b bg-background/80 backdrop-blur-sm"
              style={{
                gridTemplateColumns: `${SIDEBAR_WIDTH}px ${timelineWidth}px`,
              }}
            >
              <div className="sticky left-0 z-40 border-border/70 border-r bg-background/80 px-4 py-3 backdrop-blur-sm">
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

            {timeline.groups.map((group) => {
              const groupId = group.id;
              const groupList = group.list;
              const isPreviewGroup = dropPreview?.listId === groupId;
              const isMoveTargetGroup = moveTargetListId === groupList?.id;
              const showEmptyLane = group.items.length === 0;

              return (
                <div key={groupId}>
                  <div
                    className="grid border-border/60 border-b"
                    style={{
                      gridTemplateColumns: `${SIDEBAR_WIDTH}px ${timelineWidth}px`,
                    }}
                  >
                    <div className="sticky left-0 z-20 border-border/60 border-r px-4 py-2.5 backdrop-blur-sm">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {groupList?.name ?? t('unknown_list')}
                          </Badge>
                          {groupList?.status && (
                            <span className="text-[11px] text-muted-foreground uppercase tracking-[0.16em]">
                              {groupList.status}
                            </span>
                          )}
                        </div>
                        {groupList && boardId && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 shrink-0"
                            onClick={() => handleCreateTask(groupList.id)}
                            aria-label={`${t('new')} ${groupList.name}`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="relative h-12">
                      {todayVisible && (
                        <div
                          className="pointer-events-none absolute inset-y-0 border-dynamic-blue/40 border-l"
                          style={{
                            left: timeline.todayIndex * dayWidth + dayWidth / 2,
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {(showEmptyLane ? [null] : group.items).map(
                    (item, rowIndex) => {
                      const tone = item ? getStatusToneClasses(item) : null;
                      const isSelected = item
                        ? selectedTaskId === item.task.id
                        : false;

                      return (
                        <div
                          key={item?.task.id ?? `${groupId}-empty-${rowIndex}`}
                          className="grid"
                          style={{
                            gridTemplateColumns: `${SIDEBAR_WIDTH}px ${timelineWidth}px`,
                          }}
                        >
                          <div
                            className={cn(
                              'sticky left-0 z-10 border-border/60 border-r px-4 py-3',
                              isSelected && 'bg-dynamic-blue/6'
                            )}
                            style={{ minHeight: laneHeight }}
                          >
                            {item ? (
                              <div
                                className={cn(
                                  'rounded-2xl border px-3 py-3 shadow-xs transition-colors',
                                  isSelected
                                    ? 'border-dynamic-blue/30 bg-dynamic-blue/8'
                                    : 'border-border/50 bg-background/25'
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    className="truncate text-left font-medium text-sm"
                                    onClick={() =>
                                      setSelectedTaskId(item.task.id)
                                    }
                                    onDoubleClick={() => openEditor(item.task)}
                                  >
                                    {item.task.name}
                                  </button>
                                  {item.task.priority && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] uppercase"
                                    >
                                      {item.task.priority}
                                    </Badge>
                                  )}
                                </div>
                                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                                  <span>
                                    {formatShortDate(item.start)} -{' '}
                                    {formatShortDate(item.end)}
                                  </span>
                                  <span>{item.durationDays}d</span>
                                </div>
                              </div>
                            ) : (
                              <div className="flex h-full items-center">
                                <p className="max-w-[200px] text-[11px] text-muted-foreground">
                                  {t('timeline_drag_unscheduled')}
                                </p>
                              </div>
                            )}
                          </div>

                          <div
                            className={cn(
                              'relative border-border/60 border-b',
                              item ? tone?.lane : 'bg-muted/5',
                              isMoveTargetGroup && 'bg-dynamic-blue/6',
                              isPreviewGroup && 'bg-muted/10'
                            )}
                            data-timeline-lane={groupList?.id ?? groupId}
                            style={{ minHeight: laneHeight }}
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
                              !item &&
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
                                    index === 0 &&
                                      'border-l border-l-border/50',
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
                                    timeline.todayIndex * dayWidth +
                                    dayWidth / 2,
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
                                    className="pointer-events-none absolute top-1/2 z-20 -translate-y-1/2 rounded-lg border border-dynamic-blue/60 border-dashed bg-background/95 px-2 py-1 shadow-sm"
                                    style={{
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

                            {item && (
                              <ContextMenu>
                                <ContextMenuTrigger asChild>
                                  <div
                                    className={cn(
                                      'group absolute top-1/2 z-10 -translate-y-1/2 rounded-2xl border shadow-[0_10px_24px_-18px_rgba(0,0,0,0.85)] backdrop-blur-sm',
                                      tone?.bar,
                                      isSelected &&
                                        'ring-2 ring-dynamic-blue/35'
                                    )}
                                    style={{
                                      left: item.offsetDays * dayWidth + 4,
                                      width: Math.max(
                                        item.durationDays * dayWidth - 8,
                                        dayWidth - 8
                                      ),
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
                                      className="absolute inset-y-0 flex cursor-grab touch-none select-none items-center gap-2.5 px-3 text-left active:cursor-grabbing"
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
                                        <div className="flex items-center gap-2">
                                          <span className="truncate font-semibold text-sm">
                                            {item.task.name}
                                          </span>
                                          <span className="rounded-full border border-border/50 bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground">
                                            {item.durationDays}d
                                          </span>
                                        </div>
                                        {dayWidth >= 88 && (
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
                                          disabled={
                                            list.id === item.task.list_id
                                          }
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
                                    onClick={() =>
                                      setDeleteCandidate(item.task)
                                    }
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    <span className="flex-1">
                                      {t('delete')}
                                    </span>
                                  </ContextMenuItem>
                                </ContextMenuContent>
                              </ContextMenu>
                            )}
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>
              );
            })}
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
