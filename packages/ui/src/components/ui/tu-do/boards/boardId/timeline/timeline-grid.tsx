import { Plus } from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import dayjs from 'dayjs';
import type { useTranslations } from 'next-intl';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  getListStatusBadgeClasses,
  getTimelineDayGridBackground,
} from './timeline-display';
import { TimelineTaskRow } from './timeline-task-row';
import type {
  TimelineInteractionMode,
  TimelineLaneItem,
  TimelineModel,
} from './timeline-utils';

interface DropPreviewState {
  taskId: string;
  listId: string;
  dayIndex: number;
}

interface TimelineGridProps {
  timeline: TimelineModel;
  localTasks: Task[];
  boardId?: string;
  wsId?: string;
  dayWidth: number;
  sidebarWidth: number;
  timelineWidth: number;
  rowHeight: number;
  barHeight: number;
  groupHeaderHeight: number;
  todayVisible: boolean;
  selectedTaskId: string | null;
  moveTargetListId: string | null;
  draggedUnscheduledTaskId: string | null;
  dropPreview: DropPreviewState | null;
  formatMonthLabel: (date: Date) => string;
  formatWeekday: (date: Date) => string;
  formatShortDate: (date: Date) => string;
  onCreateTask: (listId?: string | null) => void;
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
  onUpdateDropPreview: (
    taskId: string,
    listId: string,
    clientX: number,
    currentTarget: HTMLDivElement
  ) => void;
  onClearDropPreview: (listId: string) => void;
  onLaneDrop: (listId: string) => void | Promise<void>;
  t: ReturnType<typeof useTranslations>;
}

export function TimelineGrid({
  timeline,
  localTasks,
  boardId,
  wsId,
  dayWidth,
  sidebarWidth,
  timelineWidth,
  rowHeight,
  barHeight,
  groupHeaderHeight,
  todayVisible,
  selectedTaskId,
  moveTargetListId,
  draggedUnscheduledTaskId,
  dropPreview,
  formatMonthLabel,
  formatWeekday,
  formatShortDate,
  onCreateTask,
  onSelectTask,
  onOpenEditor,
  onOpenTask,
  onUnscheduleTask,
  onMoveTaskToList,
  onDeleteTask,
  onActionsUpdate,
  onStartInteraction,
  onUpdateDropPreview,
  onClearDropPreview,
  onLaneDrop,
  t,
}: TimelineGridProps) {
  return (
    <div style={{ width: sidebarWidth + timelineWidth, minHeight: '100%' }}>
      <div
        className="sticky top-0 z-30 grid border-border/70 border-b bg-background/92 backdrop-blur-sm"
        style={{ gridTemplateColumns: `${sidebarWidth}px ${timelineWidth}px` }}
      >
        <div className="sticky left-0 z-40 border-border/70 border-r bg-background px-4 py-3">
          <div className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.18em]">
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
                  <span className="text-xs tabular-nums">
                    {dayjs(day).date()}
                  </span>
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
        const groupList = group.list;
        const isMoveTargetGroup = moveTargetListId === groupList?.id;
        const isPreviewGroup = dropPreview?.listId === group.id;

        return (
          <section key={group.id}>
            <div
              className="grid border-border/60 border-b bg-muted/[0.08]"
              style={{
                gridTemplateColumns: `${sidebarWidth}px ${timelineWidth}px`,
                minHeight: groupHeaderHeight,
              }}
            >
              <div className="sticky left-0 z-20 flex items-center justify-between gap-2 border-border/60 border-r bg-background/98 px-4 shadow-[14px_0_24px_-24px_rgba(0,0,0,0.95)]">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      'max-w-[220px] truncate rounded-md',
                      getListStatusBadgeClasses(groupList?.status)
                    )}
                  >
                    {groupList?.name ?? t('unknown_list')}
                  </Badge>
                  <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-[10px] text-muted-foreground tabular-nums">
                    {group.items.length}
                  </span>
                </div>
                {groupList && boardId && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onClick={() => onCreateTask(groupList.id)}
                    aria-label={`${t('new')} ${groupList.name}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
              <TimelineGroupDropTarget
                groupId={group.id}
                localTasks={localTasks}
                dayWidth={dayWidth}
                groupHeaderHeight={groupHeaderHeight}
                isMoveTargetGroup={isMoveTargetGroup}
                isPreviewGroup={isPreviewGroup}
                dropPreview={dropPreview}
                draggedUnscheduledTaskId={draggedUnscheduledTaskId}
                onUpdateDropPreview={onUpdateDropPreview}
                onClearDropPreview={onClearDropPreview}
                onLaneDrop={onLaneDrop}
                t={t}
              />
            </div>

            {group.items.length > 0 ? (
              group.items.map((item) => (
                <TimelineTaskRow
                  key={item.task.id}
                  item={item}
                  groupId={group.id}
                  lists={timeline.groups.flatMap((candidate) =>
                    candidate.list ? [candidate.list] : []
                  )}
                  boardId={boardId}
                  wsId={wsId}
                  dayWidth={dayWidth}
                  timelineWidth={timelineWidth}
                  sidebarWidth={sidebarWidth}
                  rowHeight={rowHeight}
                  barHeight={barHeight}
                  todayIndex={timeline.todayIndex}
                  todayVisible={todayVisible}
                  isSelected={selectedTaskId === item.task.id}
                  isMoveTarget={isMoveTargetGroup}
                  formatShortDate={formatShortDate}
                  onSelectTask={onSelectTask}
                  onOpenEditor={onOpenEditor}
                  onOpenTask={onOpenTask}
                  onUnscheduleTask={onUnscheduleTask}
                  onMoveTaskToList={onMoveTaskToList}
                  onDeleteTask={onDeleteTask}
                  onActionsUpdate={onActionsUpdate}
                  onStartInteraction={onStartInteraction}
                  t={t}
                />
              ))
            ) : (
              <div
                className="grid border-border/55 border-b"
                style={{
                  gridTemplateColumns: `${sidebarWidth}px ${timelineWidth}px`,
                  minHeight: rowHeight,
                }}
              >
                <div className="sticky left-0 z-10 flex items-center border-border/60 border-r bg-background/95 px-4 text-[12px] text-muted-foreground shadow-[14px_0_24px_-24px_rgba(0,0,0,0.95)]">
                  {t('timeline_drop_to_schedule')}
                </div>
                <TimelineGroupDropTarget
                  groupId={group.id}
                  localTasks={localTasks}
                  dayWidth={dayWidth}
                  groupHeaderHeight={rowHeight}
                  isMoveTargetGroup={isMoveTargetGroup}
                  isPreviewGroup={isPreviewGroup}
                  dropPreview={dropPreview}
                  draggedUnscheduledTaskId={draggedUnscheduledTaskId}
                  onUpdateDropPreview={onUpdateDropPreview}
                  onClearDropPreview={onClearDropPreview}
                  onLaneDrop={onLaneDrop}
                  t={t}
                />
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function TimelineGroupDropTarget({
  groupId,
  localTasks,
  dayWidth,
  groupHeaderHeight,
  isMoveTargetGroup,
  isPreviewGroup,
  dropPreview,
  draggedUnscheduledTaskId,
  onUpdateDropPreview,
  onClearDropPreview,
  onLaneDrop,
  t,
}: {
  groupId: string;
  localTasks: Task[];
  dayWidth: number;
  groupHeaderHeight: number;
  isMoveTargetGroup: boolean;
  isPreviewGroup: boolean;
  dropPreview: DropPreviewState | null;
  draggedUnscheduledTaskId: string | null;
  onUpdateDropPreview: TimelineGridProps['onUpdateDropPreview'];
  onClearDropPreview: TimelineGridProps['onClearDropPreview'];
  onLaneDrop: TimelineGridProps['onLaneDrop'];
  t: TimelineGridProps['t'];
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden',
        isMoveTargetGroup && 'bg-dynamic-blue/6',
        isPreviewGroup && 'bg-muted/10'
      )}
      data-timeline-lane={groupId}
      data-testid={`timeline-drop-target-${groupId}`}
      style={{ minHeight: groupHeaderHeight }}
      onDragOver={(event) => {
        const taskId =
          draggedUnscheduledTaskId || event.dataTransfer.getData('text/plain');
        if (!taskId) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        onUpdateDropPreview(
          taskId,
          groupId,
          event.clientX,
          event.currentTarget
        );
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          onClearDropPreview(groupId);
        }
      }}
      onDrop={async (event) => {
        event.preventDefault();
        await onLaneDrop(groupId);
      }}
    >
      {dropPreview?.listId === groupId &&
        (() => {
          const previewTask = localTasks.find(
            (task) => task.id === dropPreview.taskId
          );
          if (!previewTask) return null;

          return (
            <div
              className="pointer-events-none absolute z-20 max-w-64 rounded-lg border border-dynamic-blue/60 border-dashed bg-background/95 px-2 py-1 shadow-sm"
              style={{
                top: Math.max(6, (groupHeaderHeight - 30) / 2),
                left: dropPreview.dayIndex * dayWidth + 4,
                width: Math.max(dayWidth * 2 - 8, 72),
              }}
            >
              <p className="truncate font-medium text-[11px]">
                {previewTask.name}
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {t('timeline_drop_to_schedule')}
              </p>
            </div>
          );
        })()}
      <div
        className="pointer-events-none absolute inset-0"
        style={getTimelineDayGridBackground(dayWidth, 0.35)}
      />
    </div>
  );
}
