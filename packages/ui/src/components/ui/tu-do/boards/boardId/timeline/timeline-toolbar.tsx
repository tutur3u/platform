import {
  Clock,
  Crosshair,
  Expand,
  GripHorizontal,
  MoreHorizontal,
  Plus,
  ZoomIn,
} from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Slider } from '@tuturuuu/ui/slider';
import { cn } from '@tuturuuu/utils/format';
import type { useTranslations } from 'next-intl';
import type { Dispatch, SetStateAction } from 'react';
import { useState } from 'react';
import { TaskRowActionsMenu } from '../../../shared/task-row-actions-menu';
import {
  COLLAPSED_UNSCHEDULED_PREVIEW_COUNT,
  DEFAULT_DAY_WIDTH,
  type Density,
  getListName,
  MAX_DAY_WIDTH,
  MIN_DAY_WIDTH,
} from './timeline-display';
import type { TimelineModel } from './timeline-utils';

interface TimelineToolbarProps {
  timeline: TimelineModel;
  unscheduledTasks: Task[];
  lists: TaskList[];
  boardId?: string;
  wsId?: string;
  primaryCreateListId: string | null;
  dayWidth: number;
  setDayWidth: (value: number) => void;
  density: Density;
  setDensity: (value: Density) => void;
  isUnscheduledPopoverOpen: boolean;
  setIsUnscheduledPopoverOpen: (open: boolean) => void;
  isUnscheduledExpanded: boolean;
  setIsUnscheduledExpanded: Dispatch<SetStateAction<boolean>>;
  draggedUnscheduledTaskId: string | null;
  formatLongDate: (date: Date) => string;
  onCreateTask: () => void;
  onScrollToToday: () => void;
  onFitTimeline: () => void;
  onOpenEditor: (task: Task) => void;
  onActionsUpdate?: () => void;
  onUnscheduledDragStart: (taskId: string) => void;
  onUnscheduledDragEnd: () => void;
  t: ReturnType<typeof useTranslations>;
}

type ToolbarTaskMenuState = {
  taskId: string;
  point?: { x: number; y: number } | null;
};

export function TimelineToolbar({
  timeline,
  unscheduledTasks,
  lists,
  boardId,
  wsId,
  primaryCreateListId,
  dayWidth,
  setDayWidth,
  density,
  setDensity,
  isUnscheduledPopoverOpen,
  setIsUnscheduledPopoverOpen,
  isUnscheduledExpanded,
  setIsUnscheduledExpanded,
  draggedUnscheduledTaskId,
  formatLongDate,
  onCreateTask,
  onScrollToToday,
  onFitTimeline,
  onOpenEditor,
  onActionsUpdate,
  onUnscheduledDragStart,
  onUnscheduledDragEnd,
  t,
}: TimelineToolbarProps) {
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
  const [openTaskMenu, setOpenTaskMenu] = useState<ToolbarTaskMenuState | null>(
    null
  );

  return (
    <div className="border-border/70 border-b px-3 py-2.5 md:px-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm">
          {unscheduledTasks.length > 0 ? (
            <Popover
              open={isUnscheduledPopoverOpen}
              onOpenChange={(open) => {
                setIsUnscheduledPopoverOpen(open);
                if (open) setIsUnscheduledExpanded(true);
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
                className="w-[min(600px,calc(100vw-2rem))] rounded-2xl border border-border/70 bg-background/95 p-3 shadow-2xl backdrop-blur-md"
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
                      {t('timeline_drag_unscheduled')}
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
                      ? 'grid max-h-80 grid-cols-1 gap-2 overflow-auto pr-1 sm:grid-cols-2'
                      : 'flex gap-2 overflow-x-auto pb-1'
                  )}
                >
                  {visibleUnscheduledTasks.map((task) => (
                    <div
                      key={task.id}
                      draggable
                      className={cn(
                        'group flex items-start gap-2 rounded-xl border border-border/60 bg-background/95 text-left shadow-xs transition-all hover:border-dynamic-blue/35 hover:bg-background',
                        showExpandedUnscheduled
                          ? 'w-full p-2'
                          : 'min-w-[168px] max-w-[208px] shrink-0 p-1.5',
                        draggedUnscheduledTaskId === task.id && 'opacity-40'
                      )}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', task.id);
                        onUnscheduledDragStart(task.id);
                      }}
                      onDragEnd={onUnscheduledDragEnd}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setOpenTaskMenu({
                          taskId: task.id,
                          point: { x: event.clientX, y: event.clientY },
                        });
                      }}
                    >
                      <div className="mt-0.5 rounded-full border border-border/60 bg-muted/40 p-1 text-muted-foreground transition-colors group-hover:text-foreground">
                        <GripHorizontal className="h-3 w-3" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            className="line-clamp-2 min-w-0 flex-1 text-left font-medium text-xs leading-4"
                            onClick={() => onOpenEditor(task)}
                          >
                            {task.name}
                          </button>
                          <div className="flex shrink-0 items-center gap-1">
                            <Badge
                              variant="outline"
                              className="rounded-full px-1.5 text-[9px]"
                            >
                              {getListName(task, lists, t)}
                            </Badge>
                            {boardId && wsId && (
                              <TaskRowActionsMenu
                                task={task}
                                boardId={boardId}
                                workspaceId={wsId}
                                lists={lists}
                                onUpdate={onActionsUpdate ?? (() => undefined)}
                                open={openTaskMenu?.taskId === task.id}
                                onOpenChange={(open) =>
                                  setOpenTaskMenu(
                                    open ? { taskId: task.id } : null
                                  )
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
                                    className="h-6 w-6 rounded-full opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                                    onClick={(event) => event.stopPropagation()}
                                  >
                                    <MoreHorizontal className="h-3 w-3" />
                                    <span className="sr-only">{t('open')}</span>
                                  </Button>
                                }
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!showExpandedUnscheduled && hiddenUnscheduledCount > 0 && (
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
            onClick={onCreateTask}
            disabled={!boardId || !primaryCreateListId}
            aria-label={t('new')}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-2 px-2.5"
            onClick={onScrollToToday}
          >
            <Crosshair className="h-3.5 w-3.5" />
            {t('today')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-2 px-2.5"
            onClick={onFitTimeline}
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
            <span className="w-10 text-right font-medium text-[11px] tabular-nums">
              {dayWidth}px
            </span>
          </div>
          <div className="flex items-center rounded-full border border-border bg-background/70 p-1">
            {(['compact', 'comfortable', 'expanded'] as const).map((option) => (
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
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
