'use client';

import { useMutation } from '@tanstack/react-query';
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
  AlertDialogTrigger,
} from '@tuturuuu/ui/alert-dialog';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { useLocale, useTranslations } from 'next-intl';
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTaskDialog } from '../../hooks/useTaskDialog';
import { TaskEditDialog } from './timeline/task-edit-dialog';
import {
  DEFAULT_DAY_WIDTH,
  type Density,
  DRAG_ACTIVATION_PX,
  getDensityConfig,
  MAX_DAY_WIDTH,
  MIN_DAY_WIDTH,
  SIDEBAR_WIDTH,
} from './timeline/timeline-display';
import { TimelineGrid } from './timeline/timeline-grid';
import { TimelineToolbar } from './timeline/timeline-toolbar';
import {
  buildTimelineModel,
  computeTimelineSpans,
  deriveDraftRange,
  pixelToDayDelta,
  type TimelineInteractionMode,
  type TimelineLaneItem,
} from './timeline/timeline-utils';

export type { TimelineGroup, TimelineItem } from './timeline/timeline-utils';
export { computeTimelineSpans, pixelToDayDelta };

export interface TimelineProps {
  tasks: Task[];
  lists: TaskList[];
  boardId?: string;
  wsId?: string;
  className?: string;
  onTaskPartialUpdate?: (taskId: string, updates: Partial<Task>) => void;
}

type TimelineTaskUpdate = Partial<Omit<Task, 'end_date' | 'start_date'>> & {
  end_date?: string | null;
  start_date?: string | null;
};

type TaskDraft = Pick<
  TimelineTaskUpdate,
  'deleted_at' | 'end_date' | 'list_id' | 'name' | 'sort_key' | 'start_date'
>;

interface InteractionState {
  mode: TimelineInteractionMode;
  taskId: string;
  originX: number;
  originalStart: Date;
  originalEnd: Date;
  originalListId?: string | null;
  moved: boolean;
}

interface DropPreviewState {
  taskId: string;
  listId: string;
  dayIndex: number;
}

const toPersistedDate = (date: Date | null) => date?.toISOString() ?? null;

const toDraftDate = (date: Date | null) => date?.toISOString() ?? null;

function applyTaskDrafts(tasks: Task[], drafts: Record<string, TaskDraft>) {
  return tasks.map((task) =>
    drafts[task.id] ? ({ ...task, ...drafts[task.id] } as Task) : task
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
  const { createTask, openTask } = useTaskDialog();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dayWidth, setDayWidth] = useState(DEFAULT_DAY_WIDTH);
  const [density, setDensity] = useState<Density>('comfortable');
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [unscheduledExpanded, setUnscheduledExpanded] = useState(false);
  const [localChanges, setLocalChanges] = useState<Record<string, TaskDraft>>(
    {}
  );
  const [interaction, setInteraction] = useState<InteractionState | null>(null);
  const [moveTargetListId, setMoveTargetListId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [draggedUnscheduledTaskId, setDraggedUnscheduledTaskId] = useState<
    string | null
  >(null);
  const [dropPreview, setDropPreview] = useState<DropPreviewState | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<Task | null>(null);

  useEffect(() => {
    dayjs.locale(locale === 'vi' ? 'vi' : 'en');
  }, [locale]);

  const updateTaskMutation = useMutation({
    mutationFn: ({
      workspaceId,
      taskId,
      payload,
    }: {
      workspaceId: string;
      taskId: string;
      payload: TimelineTaskUpdate;
    }) =>
      updateWorkspaceTask(
        workspaceId,
        taskId,
        payload as Parameters<typeof updateWorkspaceTask>[2]
      ),
  });

  const deleteTaskMutation = useMutation({
    mutationFn: ({
      workspaceId,
      taskId,
    }: {
      workspaceId: string;
      taskId: string;
    }) => deleteWorkspaceTask(workspaceId, taskId),
  });

  const tasksForModel = useMemo(
    () => applyTaskDrafts(tasks, localChanges),
    [tasks, localChanges]
  );

  const timeline = useMemo(
    () => buildTimelineModel(tasksForModel, lists),
    [tasksForModel, lists]
  );

  const scheduledItems = useMemo(
    () => timeline.groups.flatMap((group) => group.items),
    [timeline.groups]
  );

  const scheduledItemsById = useMemo(
    () => new Map(scheduledItems.map((item) => [item.task.id, item])),
    [scheduledItems]
  );

  const densityConfig = useMemo(() => getDensityConfig(density), [density]);
  const sidebarWidth = SIDEBAR_WIDTH;
  const timelineWidth = timeline.days.length * dayWidth;
  const todayIndex = timeline.todayIndex;
  const todayVisible = todayIndex >= 0 && todayIndex < timeline.days.length;
  const primaryCreateListId = selectedTaskId
    ? (scheduledItemsById.get(selectedTaskId)?.task.list_id ?? lists[0]?.id)
    : lists[0]?.id;

  const formatShortDate = useCallback(
    (value: string | Date | null | undefined) => {
      if (!value) return t('timeline_unscheduled');
      return dayjs(value).format('MMM D');
    },
    [t]
  );

  const formatLongDate = useCallback(
    (value: string | Date | null | undefined) => {
      if (!value) return t('timeline_unscheduled');
      return dayjs(value).format('MMM D, YYYY');
    },
    [t]
  );

  const formatWeekday = useCallback(
    (date: Date) => dayjs(date).format(dayWidth >= 88 ? 'ddd' : 'dd'),
    [dayWidth]
  );

  const formatMonthLabel = useCallback(
    (date: Date) => dayjs(date).format('MMMM YYYY'),
    []
  );

  const clearDraft = useCallback((taskId: string) => {
    setLocalChanges((current) => {
      if (!current[taskId]) return current;
      const next = { ...current };
      delete next[taskId];
      return next;
    });
  }, []);

  const updateDraftForInteraction = useCallback(
    (taskId: string, changes: TaskDraft) => {
      setLocalChanges((current) => ({
        ...current,
        [taskId]: {
          ...current[taskId],
          ...changes,
        },
      }));
    },
    []
  );

  const commitTaskChanges = useCallback(
    async (task: Task, payload: TimelineTaskUpdate) => {
      if (!wsId) throw new Error('Workspace ID is required');
      onTaskPartialUpdate?.(task.id, payload as Partial<Task>);
      await updateTaskMutation.mutateAsync({
        workspaceId: wsId,
        taskId: task.id,
        payload,
      });
      clearDraft(task.id);
    },
    [clearDraft, onTaskPartialUpdate, updateTaskMutation, wsId]
  );

  const openEditor = useCallback((task: Task) => {
    setEditingTaskId(task.id);
    setEditName(task.name ?? '');
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
    setSavingEdit(false);
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingTaskId) return;
    const task = tasksForModel.find((item) => item.id === editingTaskId);
    if (!task) return;
    setSavingEdit(true);
    const start = editStart ? dayjs(editStart).startOf('day').toDate() : null;
    const end = editEnd ? dayjs(editEnd).endOf('day').toDate() : null;

    const payload: TimelineTaskUpdate = {
      name: editName.trim() || task.name,
      start_date: toPersistedDate(start),
      end_date: toPersistedDate(end),
    };

    updateDraftForInteraction(task.id, {
      name: payload.name,
      start_date: toDraftDate(start),
      end_date: toDraftDate(end),
    });

    try {
      await commitTaskChanges(task, payload);
      closeEditor();
    } catch (error) {
      clearDraft(task.id);
      console.error(error);
      setSavingEdit(false);
    }
  }, [
    clearDraft,
    closeEditor,
    commitTaskChanges,
    editEnd,
    editName,
    editStart,
    editingTaskId,
    tasksForModel,
    updateDraftForInteraction,
  ]);

  const handleStartInteraction = useCallback(
    (
      item: TimelineLaneItem,
      mode: TimelineInteractionMode,
      event: ReactPointerEvent<Element>
    ) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      setSelectedTaskId(item.task.id);
      setInteraction({
        mode,
        taskId: item.task.id,
        originX: event.clientX,
        originalStart: item.start,
        originalEnd: item.end,
        originalListId: item.task.list_id,
        moved: false,
      });
    },
    []
  );

  const updateDropPreview = useCallback(
    (
      taskId: string,
      listId: string,
      clientX: number,
      currentTarget: HTMLDivElement
    ) => {
      if (!lists.some((list) => list.id === listId)) return;
      const rect = currentTarget.getBoundingClientRect();
      const rawIndex = Math.floor((clientX - rect.left) / dayWidth);
      const dayIndex = Math.min(
        timeline.days.length - 1,
        Math.max(0, Number.isFinite(rawIndex) ? rawIndex : 0)
      );
      setDropPreview({ taskId, listId, dayIndex });
    },
    [dayWidth, lists, timeline.days.length]
  );

  const handleLaneDrop = useCallback(
    async (listId: string) => {
      if (
        !dropPreview ||
        dropPreview.listId !== listId ||
        !lists.some((list) => list.id === listId)
      ) {
        return;
      }
      const task = tasksForModel.find((item) => item.id === dropPreview.taskId);
      if (!task) return;
      const day = timeline.days[dropPreview.dayIndex];
      if (!day) return;

      const start = dayjs(day).startOf('day');
      const end = start.endOf('day');
      const payload: TimelineTaskUpdate = {
        start_date: start.toDate().toISOString(),
        end_date: end.toDate().toISOString(),
        list_id: listId,
      };

      updateDraftForInteraction(task.id, {
        start_date: payload.start_date ?? null,
        end_date: payload.end_date ?? null,
        list_id: listId,
      });

      setDropPreview(null);
      setDraggedUnscheduledTaskId(null);
      setPopoverOpen(false);

      try {
        await commitTaskChanges(task, payload);
      } catch (error) {
        clearDraft(task.id);
        console.error(error);
      }
    },
    [
      clearDraft,
      commitTaskChanges,
      dropPreview,
      lists,
      tasksForModel,
      timeline.days,
      updateDraftForInteraction,
    ]
  );

  const handleUnscheduledDragStart = useCallback((taskId: string) => {
    setDraggedUnscheduledTaskId(taskId);
  }, []);

  const handleUnscheduledDragEnd = useCallback(() => {
    setDraggedUnscheduledTaskId(null);
    setDropPreview(null);
  }, []);

  const clearDropPreview = useCallback((listId: string) => {
    setDropPreview((current) => (current?.listId === listId ? null : current));
  }, []);

  const handleUnscheduleTask = useCallback(
    async (task: Task) => {
      const payload: TimelineTaskUpdate = {
        start_date: null,
        end_date: null,
      };
      updateDraftForInteraction(task.id, {
        start_date: null,
        end_date: null,
      });
      try {
        await commitTaskChanges(task, payload);
      } catch (error) {
        clearDraft(task.id);
        console.error(error);
      }
    },
    [clearDraft, commitTaskChanges, updateDraftForInteraction]
  );

  const handleMoveTaskToList = useCallback(
    async (task: Task, listId: string) => {
      if (task.list_id === listId) return;
      const payload: TimelineTaskUpdate = { list_id: listId };
      updateDraftForInteraction(task.id, { list_id: listId });
      try {
        await commitTaskChanges(task, payload);
      } catch (error) {
        clearDraft(task.id);
        console.error(error);
      }
    },
    [clearDraft, commitTaskChanges, updateDraftForInteraction]
  );

  const handleCreateTask = useCallback(
    (listId: string | null | undefined) => {
      if (!boardId || !listId) return;
      setSelectedTaskId(null);
      createTask(boardId, listId, lists, undefined, {
        start_date: dayjs().startOf('day').toISOString(),
        end_date: dayjs().endOf('day').toISOString(),
      });
    },
    [boardId, createTask, lists]
  );

  const handleDeleteTask = useCallback(
    async (task: Task) => {
      setLocalChanges((current) => ({
        ...current,
        [task.id]: {
          ...current[task.id],
          deleted_at: new Date().toISOString(),
        },
      }));
      onTaskPartialUpdate?.(task.id, {
        deleted_at: new Date().toISOString(),
      } as Partial<Task>);
      try {
        if (!wsId) throw new Error('Workspace ID is required');
        await deleteTaskMutation.mutateAsync({
          workspaceId: wsId,
          taskId: task.id,
        });
        clearDraft(task.id);
      } catch (error) {
        clearDraft(task.id);
        console.error(error);
      } finally {
        setDeleteCandidate(null);
      }
    },
    [clearDraft, deleteTaskMutation, onTaskPartialUpdate, wsId]
  );

  const scrollToToday = useCallback(() => {
    const node = scrollRef.current;
    if (!node || !todayVisible) return;
    const target =
      sidebarWidth +
      todayIndex * dayWidth -
      (node.clientWidth - sidebarWidth) / 2;
    node.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [dayWidth, todayIndex, todayVisible]);

  const fitTimeline = useCallback(() => {
    const node = scrollRef.current;
    if (!node || timeline.days.length <= 0) return;
    const available = Math.max(360, node.clientWidth - sidebarWidth);
    const nextWidth = Math.min(
      MAX_DAY_WIDTH,
      Math.max(MIN_DAY_WIDTH, available / timeline.days.length)
    );
    setDayWidth(Math.round(nextWidth));
  }, [timeline.days.length]);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node || !todayVisible) return;
    const target =
      sidebarWidth +
      todayIndex * dayWidth -
      (node.clientWidth - sidebarWidth) / 2;
    node.scrollLeft = Math.max(0, target);
  }, [dayWidth, todayIndex, todayVisible]);

  useEffect(() => {
    if (!interaction) return;

    const handlePointerMove = (event: PointerEvent) => {
      const dx = event.clientX - interaction.originX;
      const moved = interaction.moved || Math.abs(dx) >= DRAG_ACTIVATION_PX;
      const dayDelta = pixelToDayDelta(dx, dayWidth);
      const task = tasksForModel.find((item) => item.id === interaction.taskId);
      if (!task) return;

      const { start, end } = deriveDraftRange({
        task,
        mode: interaction.mode,
        originalStart: interaction.originalStart,
        originalEnd: interaction.originalEnd,
        dayDelta,
      });

      let nextListId: string | null | undefined = interaction.originalListId;
      if (interaction.mode === 'move') {
        const lane = document
          .elementFromPoint(event.clientX, event.clientY)
          ?.closest<HTMLElement>('[data-timeline-lane]');
        const targetListId = lane?.dataset.timelineLane;
        if (targetListId && lists.some((list) => list.id === targetListId)) {
          nextListId = targetListId;
          setMoveTargetListId(targetListId);
        } else {
          setMoveTargetListId(null);
        }
      }

      updateDraftForInteraction(task.id, {
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        ...(nextListId && nextListId !== task.list_id
          ? { list_id: nextListId }
          : {}),
      });

      if (moved && !interaction.moved) {
        setInteraction({ ...interaction, moved: true });
      }
    };

    const handlePointerUp = async () => {
      const task = tasksForModel.find((item) => item.id === interaction.taskId);
      setInteraction(null);
      setMoveTargetListId(null);
      if (!task) return;

      const draft = localChanges[task.id];
      if (!draft) return;

      const payload: TimelineTaskUpdate = {
        start_date:
          typeof draft.start_date === 'string' ? draft.start_date : undefined,
        end_date:
          typeof draft.end_date === 'string' ? draft.end_date : undefined,
        ...(draft.list_id && draft.list_id !== interaction.originalListId
          ? { list_id: draft.list_id }
          : {}),
      };

      try {
        await commitTaskChanges(task, payload);
      } catch (error) {
        clearDraft(task.id);
        console.error(error);
      }
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
    lists,
    localChanges,
    tasksForModel,
    updateDraftForInteraction,
  ]);

  const editingTask = editingTaskId
    ? tasksForModel.find((task) => task.id === editingTaskId)
    : null;

  return (
    <section
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-xl border border-border/50 bg-background',
        className
      )}
    >
      <TimelineToolbar
        boardId={boardId}
        dayWidth={dayWidth}
        density={density}
        formatLongDate={formatLongDate}
        draggedUnscheduledTaskId={draggedUnscheduledTaskId}
        isUnscheduledExpanded={unscheduledExpanded}
        isUnscheduledPopoverOpen={popoverOpen}
        lists={lists}
        onCreateTask={() => handleCreateTask(primaryCreateListId)}
        onFitTimeline={fitTimeline}
        onOpenEditor={openEditor}
        onScrollToToday={scrollToToday}
        onUnscheduledDragEnd={handleUnscheduledDragEnd}
        onUnscheduledDragStart={handleUnscheduledDragStart}
        primaryCreateListId={primaryCreateListId ?? null}
        setDayWidth={setDayWidth}
        setDensity={setDensity}
        setIsUnscheduledExpanded={setUnscheduledExpanded}
        setIsUnscheduledPopoverOpen={setPopoverOpen}
        t={t}
        timeline={timeline}
        unscheduledTasks={timeline.unscheduled}
      />

      <div className="min-h-0 flex-1 overflow-auto" ref={scrollRef}>
        <TimelineGrid
          barHeight={densityConfig.barHeight}
          boardId={boardId}
          dayWidth={dayWidth}
          draggedUnscheduledTaskId={draggedUnscheduledTaskId}
          dropPreview={dropPreview}
          formatMonthLabel={formatMonthLabel}
          formatShortDate={formatShortDate}
          formatWeekday={formatWeekday}
          groupHeaderHeight={densityConfig.groupHeaderHeight}
          localTasks={tasksForModel}
          moveTargetListId={moveTargetListId}
          onCreateTask={handleCreateTask}
          onClearDropPreview={clearDropPreview}
          onDeleteTask={setDeleteCandidate}
          onLaneDrop={handleLaneDrop}
          onMoveTaskToList={handleMoveTaskToList}
          onOpenEditor={openEditor}
          onOpenTask={(task) => boardId && openTask(task, boardId, lists)}
          onSelectTask={setSelectedTaskId}
          onStartInteraction={handleStartInteraction}
          onUnscheduleTask={handleUnscheduleTask}
          onUpdateDropPreview={updateDropPreview}
          rowHeight={densityConfig.rowHeight}
          selectedTaskId={selectedTaskId}
          sidebarWidth={sidebarWidth}
          t={t}
          timeline={timeline}
          timelineWidth={timelineWidth}
          todayVisible={todayVisible}
        />

        {timeline.scheduledCount === 0 ? (
          <div className="sticky left-0 w-[min(520px,100%)] px-6 py-8">
            <div className="rounded-lg border border-dynamic-teal/50 border-dashed bg-dynamic-teal/5 p-5 text-sm">
              <div className="font-medium text-foreground">
                {t('timeline_no_scheduled_tasks')}
              </div>
              <p className="mt-2 text-muted-foreground">
                {t('timeline_no_scheduled_tasks_description')}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <TaskEditDialog
        cancelLabel={t('cancel')}
        description={t('timeline_edit_task_description')}
        end={editEnd}
        endLabel={t('end_date')}
        name={editName}
        nameLabel={t('name')}
        onEndChange={setEditEnd}
        onNameChange={setEditName}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
        onSave={handleSaveEdit}
        onStartChange={setEditStart}
        open={Boolean(editingTask)}
        placeholder={t('name')}
        saveLabel={t('save')}
        saving={savingEdit}
        savingLabel={t('saving')}
        start={editStart}
        startLabel={t('start_date')}
        title={t('timeline_edit_task')}
      />

      <AlertDialog
        open={Boolean(deleteCandidate)}
        onOpenChange={(open) => !open && setDeleteCandidate(null)}
      >
        <AlertDialogTrigger asChild>
          <span />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('timeline_delete_task')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('timeline_delete_task_description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteCandidate) void handleDeleteTask(deleteCandidate);
              }}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
