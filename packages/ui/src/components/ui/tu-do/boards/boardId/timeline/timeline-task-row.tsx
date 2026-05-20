import {
  ArrowLeftRight,
  CalendarDays,
  Clock,
  GripHorizontal,
  MoreHorizontal,
  Pencil,
  Trash2,
} from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import type { useTranslations } from 'next-intl';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useState } from 'react';
import { TaskRowActionsMenu } from '../../../shared/task-row-actions-menu';
import {
  getStatusToneClasses,
  getTaskEyebrow,
  HANDLE_WIDTH,
} from './timeline-display';
import type {
  TimelineInteractionMode,
  TimelineLaneItem,
} from './timeline-utils';

interface TimelineTaskRowProps {
  item: TimelineLaneItem;
  groupId: string;
  lists: TaskList[];
  boardId?: string;
  wsId?: string;
  dayWidth: number;
  timelineWidth: number;
  sidebarWidth: number;
  rowHeight: number;
  barHeight: number;
  todayIndex: number;
  todayVisible: boolean;
  isSelected: boolean;
  isMoveTarget: boolean;
  formatShortDate: (date: Date) => string;
  onSelectTask: (taskId: string) => void;
  onOpenEditor: (task: Task) => void;
  onOpenTask: (task: Task) => void;
  onUnscheduleTask: (task: Task) => void;
  onMoveTaskToList: (task: Task, listId: string) => void;
  onDeleteTask: (task: Task) => void;
  onActionsUpdate?: () => void;
  onStartInteraction: (
    item: TimelineLaneItem,
    mode: TimelineInteractionMode,
    event: ReactPointerEvent
  ) => void;
  t: ReturnType<typeof useTranslations>;
}

type TimelineTaskMenuState = {
  open: boolean;
  point?: { x: number; y: number } | null;
};

export function TimelineTaskRow({
  item,
  groupId,
  lists,
  boardId,
  wsId,
  dayWidth,
  timelineWidth,
  sidebarWidth,
  rowHeight,
  barHeight,
  todayIndex,
  todayVisible,
  isSelected,
  isMoveTarget,
  formatShortDate,
  onSelectTask,
  onOpenEditor,
  onOpenTask,
  onUnscheduleTask,
  onMoveTaskToList,
  onDeleteTask,
  onActionsUpdate,
  onStartInteraction,
  t,
}: TimelineTaskRowProps) {
  const tone = getStatusToneClasses(item);
  const barWidth = Math.max(item.durationDays * dayWidth - 10, 20);
  const barLeft = item.offsetDays * dayWidth + 5;
  const barTop = Math.max(0, (rowHeight - barHeight) / 2);
  const eyebrow = getTaskEyebrow(item.task);
  const dateLabel = `${formatShortDate(item.start)} - ${formatShortDate(item.end)}`;
  const isOneDay = item.durationDays === 1;
  const rangeLabel = isOneDay
    ? formatShortDate(item.start)
    : `${dateLabel} · ${item.durationDays}d`;
  const [actionsMenu, setActionsMenu] = useState<TimelineTaskMenuState>({
    open: false,
    point: null,
  });
  const isCrossWorkspaceExternal = Boolean(
    item.task.source_workspace_id && item.task.source_workspace_id !== wsId
  );
  const scheduleActions = (
    <>
      <DropdownMenuItem
        className="gap-3"
        onClick={() => onOpenEditor(item.task)}
      >
        <CalendarDays className="h-4 w-4" />
        <span className="flex-1">{t('timeline_edit_task')}</span>
      </DropdownMenuItem>
      <DropdownMenuItem
        className="gap-3"
        onClick={() => onOpenTask(item.task)}
        disabled={!boardId}
      >
        <Pencil className="h-4 w-4" />
        <span className="flex-1">{t('edit')}</span>
      </DropdownMenuItem>
      <DropdownMenuSeparator className="my-1.5" />
      <DropdownMenuItem
        className="gap-3"
        onClick={() => onUnscheduleTask(item.task)}
      >
        <Clock className="h-4 w-4" />
        <span className="flex-1">{t('timeline_remove_from_timeline')}</span>
      </DropdownMenuItem>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger
          className="gap-3"
          disabled={isCrossWorkspaceExternal}
        >
          <ArrowLeftRight className="h-4 w-4" />
          <span className="flex-1">{t('timeline_move_to_list')}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-48">
          {lists.map((list) => (
            <DropdownMenuItem
              key={list.id}
              disabled={list.id === item.task.list_id}
              className="gap-3"
              onClick={() => onMoveTaskToList(item.task, list.id)}
            >
              <span className="h-2 w-2 rounded-full bg-border/80" />
              <span className="flex-1 truncate">{list.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator className="my-1.5" />
      <DropdownMenuItem
        className="gap-3 text-dynamic-red focus:text-dynamic-red"
        onClick={() => onDeleteTask(item.task)}
      >
        <Trash2 className="h-4 w-4" />
        <span className="flex-1">{t('delete')}</span>
      </DropdownMenuItem>
    </>
  );

  return (
    <div
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setActionsMenu({
          open: true,
          point: { x: event.clientX, y: event.clientY },
        });
      }}
    >
      <div
        className={cn(
          'group grid border-border/55 border-b transition-colors',
          tone.row,
          isSelected && 'bg-dynamic-blue/[0.055]',
          isMoveTarget && 'bg-dynamic-blue/[0.04]'
        )}
        style={{
          gridTemplateColumns: `${sidebarWidth}px ${timelineWidth}px`,
          minHeight: rowHeight,
        }}
      >
        <div
          className={cn(
            'sticky left-0 z-10 flex min-w-0 items-center gap-3 border-border/60 border-r bg-background/95 px-4 text-left shadow-[14px_0_24px_-24px_rgba(0,0,0,0.95)] transition-colors',
            isSelected && 'bg-dynamic-blue/[0.075]'
          )}
        >
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            onClick={() => onSelectTask(item.task.id)}
            onDoubleClick={() => onOpenEditor(item.task)}
          >
            <span
              className={cn('h-9 w-1.5 shrink-0 rounded-full border', tone.bar)}
            />
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                {eyebrow && (
                  <span className="shrink-0 rounded-md border border-border/60 bg-muted/30 px-1.5 py-0.5 font-semibold text-[10px] text-muted-foreground">
                    {eyebrow}
                  </span>
                )}
                {item.task.priority && (
                  <span className="shrink-0 rounded-md border border-border/60 px-1.5 py-0.5 font-semibold text-[10px] text-muted-foreground uppercase">
                    {item.task.priority}
                  </span>
                )}
              </div>
              <p className="mt-1 truncate font-semibold text-foreground text-sm leading-5">
                {item.task.name}
              </p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {rangeLabel}
              </p>
            </div>
          </button>
          {boardId && wsId && (
            <TaskRowActionsMenu
              task={item.task}
              boardId={boardId}
              workspaceId={wsId}
              lists={lists}
              onUpdate={onActionsUpdate ?? (() => undefined)}
              open={actionsMenu.open}
              onOpenChange={(open) =>
                setActionsMenu(open ? { open, point: null } : { open })
              }
              contextMenuPoint={actionsMenu.point}
              trigger={
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                  onClick={(event) => event.stopPropagation()}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                  <span className="sr-only">{t('open')}</span>
                </Button>
              }
              extraTopItems={scheduleActions}
            />
          )}
        </div>

        <div
          className="relative overflow-hidden"
          data-timeline-lane={groupId}
          style={{ minHeight: rowHeight }}
          onDoubleClick={() => onOpenEditor(item.task)}
        >
          <div className="pointer-events-none absolute inset-0 flex">
            {Array.from({
              length: Math.max(1, Math.ceil(timelineWidth / dayWidth)),
            }).map((_, index) => {
              const isToday = todayVisible && index === todayIndex;
              const date = item.start
                ? dayjs(item.start).add(index - item.offsetDays, 'day')
                : null;
              const isWeekend = date ? [0, 6].includes(date.day()) : false;

              return (
                <div
                  key={`${item.task.id}-${index}`}
                  className={cn(
                    'h-full border-border/45 border-r',
                    index === 0 && 'border-l border-l-border/50',
                    isWeekend && 'bg-muted/[0.12]',
                    isToday && 'bg-dynamic-blue/[0.035]'
                  )}
                  style={{ width: dayWidth }}
                />
              );
            })}
          </div>

          {todayVisible && (
            <div
              className="pointer-events-none absolute inset-y-0 z-0 border-dynamic-blue/45 border-l"
              style={{ left: todayIndex * dayWidth + dayWidth / 2 }}
            />
          )}

          <div
            className={cn(
              'group absolute z-1 rounded-full border shadow-[0_10px_24px_-18px_rgba(0,0,0,0.85)] transition-all',
              tone.bar,
              isSelected && 'ring-2 ring-dynamic-blue/35'
            )}
            style={{
              top: barTop,
              left: barLeft,
              width: barWidth,
              height: barHeight,
            }}
            title={`${item.task.name} · ${dateLabel}`}
          >
            <button
              type="button"
              className="absolute inset-y-1 left-1 flex cursor-ew-resize touch-none items-center justify-center rounded-full bg-background/55 text-muted-foreground opacity-70 transition-all hover:bg-background/85 hover:text-foreground group-hover:opacity-100"
              style={{ width: HANDLE_WIDTH }}
              aria-label={`Resize ${item.task.name} start`}
              onPointerDown={(event) =>
                onStartInteraction(item, 'resize-start', event)
              }
            >
              <span className="h-3.5 w-0.5 rounded-full bg-current" />
            </button>

            <button
              type="button"
              className="absolute inset-y-0 flex cursor-grab touch-none select-none items-center justify-center px-2 active:cursor-grabbing"
              style={{ left: HANDLE_WIDTH, right: HANDLE_WIDTH }}
              onClick={() => onSelectTask(item.task.id)}
              onPointerDown={(event) => onStartInteraction(item, 'move', event)}
            >
              <GripHorizontal className="h-3.5 w-3.5 text-current opacity-75" />
            </button>

            <button
              type="button"
              className="absolute inset-y-1 right-1 flex cursor-ew-resize touch-none items-center justify-center rounded-full bg-background/55 text-muted-foreground opacity-70 transition-all hover:bg-background/85 hover:text-foreground group-hover:opacity-100"
              style={{ width: HANDLE_WIDTH }}
              aria-label={`Resize ${item.task.name} end`}
              onPointerDown={(event) =>
                onStartInteraction(item, 'resize-end', event)
              }
            >
              <span className="h-3.5 w-0.5 rounded-full bg-current" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
