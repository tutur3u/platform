'use client';

import { Clock, Info } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { getDescriptionText } from '@tuturuuu/utils/text-helper';
import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface TimelineProps {
  tasks: Task[];
  lists: TaskList[];
  className?: string;
  /**
   * Callback for propagating optimistic partial task updates (e.g., resize, inline edit)
   * to parent so switching away/back preserves latest state before server refetch.
   */
  onTaskPartialUpdate?: (taskId: string, partial: Partial<Task>) => void;
}

interface TimelineSpan {
  task: Task;
  start: Date;
  end: Date;
  durationDays: number; // at least 1
  list?: TaskList;
  rowIndex: number; // computed stacking row to avoid overlap
  isPast: boolean;
  isOngoing: boolean;
  isFuture: boolean;
}

/**
 * Compute timeline spans from tasks; exported for unit testing.
 * - Tasks without any date will be grouped into an "unscheduled" bucket (returned separately)
 * - Ensures at least one day width
 */
export function computeTimelineSpans(tasks: Task[], lists: TaskList[]) {
  const datedTasks: TimelineSpan[] = [];
  const unscheduled: Task[] = [];
  const listById = new Map(lists.map((l) => [String(l.id), l] as const));
  const todayMid = dayjs().startOf('day');

  for (const task of tasks) {
    if (!task.start_date && !task.end_date) {
      unscheduled.push(task);
      continue;
    }
    // Derive start/end
    const rawStart = dayjs(
      task.start_date || task.end_date || todayMid.toDate()
    );
    const rawEnd = dayjs(task.end_date || rawStart.toDate());

    // Normalize to midnight boundaries
    const start = rawStart.startOf('day');
    const end = rawEnd.startOf('day');

    const durationDays = Math.max(1, end.diff(start, 'day') + 1);
    const list = listById.get(String(task.list_id));
    const span: Omit<TimelineSpan, 'rowIndex'> = {
      task,
      start: start.toDate(),
      end: end.toDate(),
      durationDays,
      list,
      isPast: end.isBefore(todayMid),
      isOngoing: !start.isAfter(todayMid) && !end.isBefore(todayMid),
      isFuture: start.isAfter(todayMid),
    };
    datedTasks.push({ ...span, rowIndex: 0 });
  }

  // Sort by start then duration
  datedTasks.sort(
    (a, b) =>
      a.start.getTime() - b.start.getTime() || a.durationDays - b.durationDays
  );

  // Simple row packing (greedy) to avoid horizontal overlap within same row
  const rows: TimelineSpan[][] = [];
  for (const span of datedTasks) {
    let placed = false;
    for (let r = 0; r < rows.length && !placed; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;
      const last = row[row.length - 1];
      if (last && last.end < span.start) {
        // no overlap
        row.push(span);
        span.rowIndex = r;
        placed = true;
      }
    }
    if (!placed) {
      span.rowIndex = rows.length;
      rows.push([span]);
    }
  }

  const minDate = datedTasks.length
    ? datedTasks.reduce(
        (min, s) => (s.start < min ? s.start : min),
        datedTasks[0]!.start
      )
    : todayMid.toDate();
  const maxDate = datedTasks.length
    ? datedTasks.reduce(
        (max, s) => (s.end > max ? s.end : max),
        datedTasks[0]!.end
      )
    : todayMid.toDate();

  return {
    spans: datedTasks,
    unscheduled,
    minDate,
    maxDate,
    rowCount: rows.length,
  };
}

// Generate array of dates (midnights) inclusive
function enumerateDays(start: Date, end: Date) {
  const days: Date[] = [];
  let cursor = dayjs(start).startOf('day');
  const endDate = dayjs(end).startOf('day');
  while (cursor.isBefore(endDate) || cursor.isSame(endDate, 'day')) {
    days.push(cursor.toDate());
    cursor = cursor.add(1, 'day');
  }
  return days;
}

// Nice label for a date (month change markers)
function formatDayLabel(d: Date) {
  return dayjs(d).format('MMM D');
}

// Week boundary check
function isWeekStart(d: Date) {
  return dayjs(d).day() === 1; // Monday start convention
}

// Alias for use inside map where shadowing occurs
const isWeekStart_ = isWeekStart;

// --- Component -------------------------------------------------------------
export function TimelineBoard({
  tasks,
  lists,
  className,
  onTaskPartialUpdate,
}: TimelineProps) {
  const t = useTranslations('common');
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<'day' | 'week'>('day');
  const [density, setDensity] = useState<
    'compact' | 'comfortable' | 'expanded'
  >('comfortable');
  // Local editable tasks copy for optimistic UI
  const [localTasks, setLocalTasks] = useState<Task[]>(tasks);
  // Re-sync when source changes (unless actively resizing/editing)
  useEffect(() => {
    setLocalTasks(tasks);
  }, [tasks]);

  // Resize state
  const [resizing, setResizing] = useState<{
    taskId: string;
    side: 'start' | 'end';
    originX: number;
    originalStart: Date;
    originalEnd: Date;
  } | null>(null);
  const [resizeDraft, setResizeDraft] = useState<
    Record<string, { start: Date; end: Date }>
  >({});
  // Removed barMargin shrinking so task bars occupy full day cell width for perfect alignment with header columns.

  // Editing dialog state
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editName, setEditName] = useState('');
  const [editStart, setEditStart] = useState<string>('');
  const [editEnd, setEditEnd] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState(false);

  // TODO(enhancement): Add drag-to-resize for task bars & inline date editing.
  // Keep <40 LOC for interactive logic or extract to dedicated hook.

  // Apply resizeDraft overrides when computing spans
  const tasksForCompute = useMemo(() => {
    if (!Object.keys(resizeDraft).length) return localTasks;
    return localTasks.map((t) => {
      const draft = resizeDraft[t.id];
      if (!draft) return t;
      return {
        ...t,
        start_date: draft.start.toISOString(),
        end_date: draft.end.toISOString(),
      } as Task;
    });
  }, [localTasks, resizeDraft]);

  const { spans, unscheduled, minDate, maxDate, rowCount } = useMemo(
    () => computeTimelineSpans(tasksForCompute, lists),
    [tasksForCompute, lists]
  );

  // Exact range (removed +/-1 day padding to keep header width equal to task extent)
  const rangeStart = useMemo(
    () =>
      new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()),
    [minDate]
  );
  const rangeEnd = useMemo(
    () =>
      new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate()),
    [maxDate]
  );

  const days = useMemo(
    () => enumerateDays(rangeStart, rangeEnd),
    [rangeStart, rangeEnd]
  );

  // Auto-scroll to today on mount
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const todayIndex = days.findIndex((d) => dayjs(d).isSame(dayjs(), 'day'));
    if (todayIndex >= 0) {
      // 44px per column initial assumption (tailwind width) * index
      requestAnimationFrame(() => {
        el.scrollLeft = Math.max(0, todayIndex * 56 - el.clientWidth / 2);
      });
    }
  }, [days]);

  // Density mapping for readability
  const dayWidth =
    density === 'compact' ? 68 : density === 'comfortable' ? 92 : 128; // px per day cell
  // Total pixel width of the scrolling region (days * dayWidth) for precise positioning.
  const totalWidth = useMemo(
    () => days.length * dayWidth,
    [days.length, dayWidth]
  );
  // CSS grid template for exact 1:1 column sizing (avoids flex rounding discrepancies)
  const dayTemplate = useMemo(
    () => (days.length ? `repeat(${days.length}, ${dayWidth}px)` : 'none'),
    [days.length, dayWidth]
  );
  const rowHeight =
    density === 'compact' ? 30 : density === 'comfortable' ? 40 : 50;
  const rowGap = density === 'expanded' ? 10 : 6;

  const todayMid = dayjs().startOf('day').toDate();

  const toggleScale = useCallback(() => {
    setScale((s) => (s === 'day' ? 'week' : 'day'));
  }, []);

  const adjustDensity = (direction: 1 | -1) => {
    setDensity((prev) => {
      const order: Array<typeof prev> = ['compact', 'comfortable', 'expanded'];
      const idx = order.indexOf(prev);
      const nextIndex = Math.min(
        order.length - 1,
        Math.max(0, idx + direction)
      );
      return order[nextIndex] as typeof prev;
    });
  };

  const scrollToToday = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const todayIndex = days.findIndex((d) => dayjs(d).isSame(dayjs(), 'day'));
    if (todayIndex >= 0) {
      el.scrollTo({
        left: Math.max(
          0,
          todayIndex * dayWidth - el.clientWidth / 2 + dayWidth / 2
        ),
        behavior: 'smooth',
      });
    }
  }, [days, dayWidth]);

  // Recenter on today when density changes to keep context
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const todayIndex = days.findIndex((d) => dayjs(d).isSame(dayjs(), 'day'));
    if (todayIndex >= 0) {
      requestAnimationFrame(() => {
        el.scrollLeft = Math.max(
          0,
          todayIndex * dayWidth - el.clientWidth / 2 + dayWidth / 2
        );
      });
    }
  }, [dayWidth, days]);

  // Group spans by list for grouping lanes (optional future). For now show single lane stack by rowIndex.

  // Resize pointer handlers
  useEffect(() => {
    if (!resizing) return;

    const originalTask = localTasks.find((t) => t.id === resizing.taskId);
    const originalStartDate = originalTask?.start_date
      ? dayjs(originalTask.start_date)
      : null;
    const originalEndDate = originalTask?.end_date
      ? dayjs(originalTask.end_date)
      : null;

    const hasStartTime =
      originalStartDate &&
      originalStartDate.valueOf() !==
        originalStartDate.startOf('day').valueOf();

    const hasEndTime =
      originalEndDate &&
      originalEndDate.valueOf() !== originalEndDate.endOf('day').valueOf() &&
      originalEndDate.valueOf() !== originalEndDate.startOf('day').valueOf();

    const applyDraft = (dayDelta: number) => {
      if (!resizing) return;
      let newStart = dayjs(resizing.originalStart);
      let newEnd = dayjs(resizing.originalEnd);

      if (resizing.side === 'start') {
        newStart = newStart.add(dayDelta, 'day');
        if (hasStartTime && originalStartDate) {
          newStart = newStart
            .hour(originalStartDate.hour())
            .minute(originalStartDate.minute())
            .second(originalStartDate.second())
            .millisecond(originalStartDate.millisecond());
        } else {
          newStart = newStart.startOf('day');
        }
        if (newStart.isAfter(newEnd)) {
          newStart = newEnd;
        }
      } else {
        // resizing.side === 'end'
        newEnd = newEnd.add(dayDelta, 'day');
        if (hasEndTime && originalEndDate) {
          newEnd = newEnd
            .hour(originalEndDate.hour())
            .minute(originalEndDate.minute())
            .second(originalEndDate.second())
            .millisecond(originalEndDate.millisecond());
        } else {
          newEnd = newEnd.endOf('day');
        }
        if (newEnd.isBefore(newStart)) {
          newEnd = newStart;
        }
      }

      if (newEnd.startOf('day').isBefore(newStart.startOf('day'))) {
        if (resizing.side === 'start') {
          newStart = newEnd;
          if (!hasStartTime) newStart = newStart.startOf('day');
        } else {
          newEnd = newStart;
          if (!hasEndTime) newEnd = newEnd.endOf('day');
        }
      }

      setResizeDraft({
        [resizing.taskId]: { start: newStart.toDate(), end: newEnd.toDate() },
      });
    };

    const handleMove = (e: PointerEvent) => {
      const deltaPx = e.clientX - resizing.originX;
      const dayDelta = pixelToDayDelta(deltaPx, dayWidth);
      applyDraft(dayDelta);
    };

    const handleUp = async () => {
      const draft = resizeDraft[resizing.taskId];
      setResizing(null);
      if (!draft) {
        setResizeDraft({});
        return;
      }
      // Optimistic update local tasks
      const startISO = draft.start.toISOString();
      const endISO = draft.end.toISOString();
      setLocalTasks((prev) =>
        prev.map((t) =>
          t.id === resizing.taskId
            ? ({ ...t, start_date: startISO, end_date: endISO } as Task)
            : t
        )
      );
      onTaskPartialUpdate?.(resizing.taskId, {
        start_date: startISO,
        end_date: endISO,
      });
      const supabase = createClient();
      try {
        await supabase
          .from('tasks')
          .update({
            start_date: draft.start.toISOString(),
            end_date: draft.end.toISOString(),
          })
          .eq('id', resizing.taskId);
      } catch (err) {
        console.error('Failed to persist resize', err);
        // Revert on failure
        setLocalTasks(tasks);
      } finally {
        setResizeDraft({});
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [resizing, dayWidth, resizeDraft, tasks, localTasks, onTaskPartialUpdate]);

  return (
    <>
      <section
        className={cn('flex h-full flex-col overflow-hidden', className)}
        aria-label="Timeline view"
      >
        <div className="flex items-center justify-between gap-4 border-b bg-background/80 px-2 py-2 backdrop-blur-sm md:px-4">
          <div className="flex items-center gap-3 text-muted-foreground text-sm">
            <Clock className="h-4 w-4" />
            <span className="font-medium">
              {spans.length} {t('scheduled')}
            </span>
            {unscheduled.length > 0 && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help rounded-md bg-dynamic-amber/20 px-2 py-1 font-medium text-dynamic-amber text-xs">
                      {unscheduled.length} {t('unscheduled')}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    <p>
                      {t('tasks_without_dates', { count: unscheduled.length })}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs underline-offset-2 opacity-60 transition-opacity hover:underline hover:opacity-100 focus:outline-none"
                    aria-label={t('help')}
                  >
                    <Info className="h-3.5 w-3.5" /> {t('help')}
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  <p className="mb-2 font-medium">{t('timeline_navigation')}</p>
                  <ul className="space-y-1 text-[11px]">
                    <li>• {t('timeline_help_drag')}</li>
                    <li>• {t('timeline_help_click')}</li>
                    <li>• {t('timeline_help_resize')}</li>
                    <li>• {t('timeline_help_density')}</li>
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={scrollToToday}
              className="h-7 px-3 text-xs"
              aria-label={t('today')}
            >
              {t('today')}
            </Button>
            <div className="flex items-center overflow-hidden rounded-md border bg-background/60">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={() => adjustDensity(-1)}
                disabled={density === 'compact'}
                aria-label="Decrease density"
              >
                -
              </Button>
              <span className="min-w-21.5 select-none px-2 text-center font-medium text-[11px] capitalize tracking-wide">
                {t(density as 'compact' | 'comfortable' | 'expanded')}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={() => adjustDensity(1)}
                disabled={density === 'expanded'}
                aria-label="Increase density"
              >
                +
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={toggleScale}
              className="hidden h-7 px-2 text-xs md:flex"
            >
              {scale === 'day' ? t('week') : t('day')}
            </Button>
          </div>
        </div>

        <div className="relative flex-1 overflow-hidden">
          <div
            ref={containerRef}
            className="relative h-full w-full overflow-auto scroll-smooth"
            aria-describedby="timeline-help"
          >
            {/* Header grid (CSS Grid for perfect alignment) */}
            <div
              className="sticky top-0 z-20 grid border-b bg-background/95 shadow-sm backdrop-blur"
              style={{ width: totalWidth, gridTemplateColumns: dayTemplate }}
            >
              {days.map((d, idx) => {
                const isToday = d.getTime() === todayMid.getTime();
                const isWeekStart = isWeekStart_(d);
                return (
                  <div
                    key={idx}
                    className={cn(
                      'relative flex h-12 flex-col items-center justify-center border-border/30 border-r font-medium text-[10px] transition-colors md:text-xs',
                      isToday && 'bg-dynamic-blue/15 text-dynamic-blue',
                      isWeekStart && !isToday && 'bg-muted/30'
                    )}
                    data-today={isToday || undefined}
                  >
                    <span
                      className={cn(
                        'leading-tight',
                        isToday && 'font-semibold'
                      )}
                    >
                      {formatDayLabel(d)}
                    </span>
                    <span
                      className={cn(
                        'mt-0.5 text-[9px] transition-opacity',
                        isWeekStart ? 'opacity-60' : 'opacity-0'
                      )}
                    >
                      W{getWeekNumber(d)}
                    </span>
                    {isToday && (
                      <span className="absolute inset-x-0 bottom-0 h-1 bg-dynamic-blue shadow-sm" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Background grid / week stripes */}
            {/* Background stripes & vertical dividers layer (single container to avoid cumulative border width drift). */}
            <div
              className="absolute top-14 bottom-0 left-0 z-0 h-full"
              style={{ width: totalWidth }}
              aria-hidden="true"
            >
              {/* Week start stripes */}
              {days.map((d, i) =>
                isWeekStart(d) ? (
                  <div
                    key={i}
                    className="absolute inset-y-0 h-full bg-dynamic-blue/5"
                    style={{ left: i * dayWidth, width: dayWidth }}
                  />
                ) : null
              )}
              {/* Vertical grid lines */}
              {days.map((_, i) => (
                <div
                  key={i}
                  className="absolute inset-y-0 h-full border-border/40 border-r"
                  style={{ left: i * dayWidth, width: 0 }}
                />
              ))}
            </div>

            {/* Today vertical line */}
            {(() => {
              const idx = days.findIndex(
                (d) => d.getTime() === todayMid.getTime()
              );
              if (idx < 0) return null;
              return (
                <div
                  className="pointer-events-none absolute top-12 bottom-0 z-10 w-0.5 bg-dynamic-blue shadow-sm"
                  style={{ left: idx * dayWidth + dayWidth / 2 }}
                  aria-hidden="true"
                />
              );
            })()}

            {/* Task rows container */}
            <div
              className="relative z-10 mt-0.5 grid"
              style={{
                minHeight: rowCount * (rowHeight + rowGap) + 80,
                width: totalWidth,
                gridTemplateColumns: dayTemplate,
                gridAutoRows: rowHeight,
                rowGap: rowGap,
              }}
            >
              {spans.map((span) => {
                const offsetDays = Math.floor(
                  (span.start.getTime() - rangeStart.getTime()) /
                    (24 * 60 * 60 * 1000)
                );
                const colSpan = span.durationDays; // inclusive
                const statusColor =
                  span.list?.status === 'done' || span.list?.status === 'closed'
                    ? 'bg-dynamic-green/60 border-dynamic-green/70 text-foreground hover:bg-dynamic-green/70'
                    : span.isOngoing
                      ? 'bg-dynamic-blue/50 border-dynamic-blue/70 text-foreground hover:bg-dynamic-blue/60'
                      : span.isFuture
                        ? 'bg-dynamic-purple/50 border-dynamic-purple/70 text-foreground hover:bg-dynamic-purple/60'
                        : 'bg-dynamic-foreground/40 border-dynamic-foreground/50 text-foreground/80 hover:bg-dynamic-foreground/50';
                return (
                  <TooltipProvider key={span.task.id} delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            'group relative col-span-(--col-span) col-start-(--col-start) row-start-(--row-start) flex h-full items-start justify-start rounded-md border-2 px-2 py-1 text-left text-[11px] leading-tight shadow-md outline-none ring-offset-background backdrop-blur-sm transition-all duration-150 hover:scale-[1.02] hover:shadow-lg focus-visible:ring-2 focus-visible:ring-dynamic-blue focus-visible:ring-offset-1',
                            statusColor,
                            resizing?.taskId === span.task.id &&
                              'scale-[1.02] border-dynamic-blue shadow-xl ring-2 ring-dynamic-blue/40'
                          )}
                          style={{
                            // Map logical indices to CSS custom properties consumed in arbitrary Tailwind selectors.
                            ['--col-start' as any]: offsetDays + 1,
                            ['--col-span' as any]: colSpan,
                            ['--row-start' as any]: span.rowIndex + 1,
                            minWidth: dayWidth,
                          }}
                          aria-label={`Task ${span.task.name} from ${span.start.toDateString()} to ${span.end.toDateString()}`}
                          onClick={() => {
                            if (resizing) return;
                            setEditingTask(span.task);
                            setEditName(span.task.name);
                            setEditStart(
                              dayjs(span.start).format('YYYY-MM-DD')
                            );
                            setEditEnd(dayjs(span.end).format('YYYY-MM-DD'));
                          }}
                        >
                          <div className="flex w-full flex-col">
                            <div className="flex items-center gap-1 pr-2">
                              <span className="truncate font-semibold text-[11px] tracking-tight">
                                {span.task.name}
                              </span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-1.5 text-[9px] opacity-80">
                              <span className="font-medium">
                                {span.durationDays}d
                              </span>
                              {span.list?.status && (
                                <span className="rounded bg-background/50 px-1.5 py-0.5 font-medium uppercase tracking-wide">
                                  {span.list.status}
                                </span>
                              )}
                            </div>
                            {/* Resize handles */}
                            <div
                              className="absolute inset-y-0 left-0 w-3 cursor-col-resize rounded-l-md bg-linear-to-r from-background/60 to-transparent opacity-0 transition-all hover:w-4 hover:from-background/80 group-hover:opacity-100"
                              aria-hidden="true"
                              onPointerDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setResizing({
                                  taskId: span.task.id,
                                  side: 'start',
                                  originX: e.clientX,
                                  originalStart: span.start,
                                  originalEnd: span.end,
                                });
                              }}
                            />
                            <div
                              className="absolute inset-y-0 right-0 w-3 cursor-col-resize rounded-r-md bg-linear-to-l from-background/60 to-transparent opacity-0 transition-all hover:w-4 hover:from-background/80 group-hover:opacity-100"
                              aria-hidden="true"
                              onPointerDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setResizing({
                                  taskId: span.task.id,
                                  side: 'end',
                                  originX: e.clientX,
                                  originalStart: span.start,
                                  originalEnd: span.end,
                                });
                              }}
                            />
                          </div>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        <p className="mb-1 font-semibold text-sm">
                          {span.task.name}
                        </p>
                        <div className="mb-2 flex items-center gap-2 text-xs opacity-90">
                          <span>{dayjs(span.start).format('MMM D, YYYY')}</span>
                          <span>→</span>
                          <span>{dayjs(span.end).format('MMM D, YYYY')}</span>
                        </div>
                        {span.list && (
                          <div className="mb-2 flex items-center gap-2 text-xs">
                            <span className="opacity-70">List:</span>
                            <span className="font-medium">
                              {span.list.name}
                            </span>
                            {span.list.status && (
                              <span className="rounded bg-dynamic-foreground/10 px-1.5 py-0.5 text-[10px] uppercase">
                                {span.list.status}
                              </span>
                            )}
                          </div>
                        )}
                        {span.task.description &&
                          getDescriptionText(span.task.description) && (
                            <p className="mt-2 line-clamp-4 border-border/40 border-t pt-2 text-xs opacity-80">
                              {getDescriptionText(span.task.description)}
                            </p>
                          )}
                        <p className="mt-2 text-[10px] italic opacity-60">
                          {t('click_to_edit_drag_to_resize')}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}

              {/* Removed unscheduled section - users can manage unscheduled tasks in Board/List views */}
            </div>
          </div>
        </div>
      </section>
      <TaskEditDialog
        task={editingTask}
        open={!!editingTask}
        onOpenChange={(o) => {
          if (!o) setEditingTask(null);
        }}
        name={editName}
        start={editStart}
        end={editEnd}
        onNameChange={setEditName}
        onStartChange={setEditStart}
        onEndChange={setEditEnd}
        onSave={async () => {
          if (!editingTask) return;
          setSavingEdit(true);
          try {
            let startStr = editStart.trim();
            let endStr = editEnd.trim();

            // Normalize: if only one provided, mirror it; if start > end, swap.
            if (startStr && !endStr) endStr = startStr;
            if (endStr && !startStr) startStr = endStr;
            if (startStr && endStr && startStr > endStr) {
              const tmp = startStr;
              startStr = endStr;
              endStr = tmp;
            }

            const startISO = startStr ? dayjs(startStr).toISOString() : null;
            const endISO = endStr ? dayjs(endStr).toISOString() : null;

            const supabase = createClient();
            await supabase
              .from('tasks')
              .update({
                name: editName.trim() || editingTask.name,
                start_date: startISO,
                end_date: endISO,
              })
              .eq('id', editingTask.id);
            const trimmedName = editName.trim();
            setLocalTasks((prev) =>
              prev.map((t) =>
                t.id === editingTask.id
                  ? ({
                      ...t,
                      name: trimmedName,
                      start_date: startISO ?? undefined,
                      end_date: endISO ?? undefined,
                    } as Task)
                  : t
              )
            );
            onTaskPartialUpdate?.(editingTask.id, {
              name: trimmedName,
              start_date: startISO ?? undefined,
              end_date: endISO ?? undefined,
            });
            setEditingTask(null);
          } catch (err) {
            console.error('Failed to save task edits', err);
          } finally {
            setSavingEdit(false);
          }
        }}
        saving={savingEdit}
      />
    </>
  );
}

// Pixel delta to whole-day delta converter (exported for tests)
export function pixelToDayDelta(px: number, dayWidth: number) {
  if (dayWidth <= 0) return 0;
  const ratio = px / dayWidth;
  // Use nearest integer but clamp tiny sub-cell movement to 0 until > 0.35 of a cell travelled for stability.
  if (Math.abs(ratio) < 0.35) return 0;
  return ratio > 0 ? Math.round(ratio) : Math.round(ratio);
}

// Global pointer handlers for resizing
if (typeof window !== 'undefined') {
  // We attach once per module; handlers dispatch custom event consumed in component hook.
}

// Hook into pointer move/up at component level
// Use effect inside component (appended after definition) to track resizing

// Extend component with resize effect
// (Placed after export function for clarity) – using declaration merging style approach not needed; add below.

// Task edit dialog component
function TaskEditDialog({
  task: _task,
  open,
  onOpenChange,
  name,
  start,
  end,
  onNameChange,
  onStartChange,
  onEndChange,
  onSave,
  saving,
}: {
  task: Task | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  name: string;
  start: string;
  end: string;
  onNameChange: (v: string) => void;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  onSave: () => void | Promise<void>;
  saving: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Task</DialogTitle>
          <DialogDescription>
            Adjust task details & schedule. Future improvement: labels &
            assignees.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1">
            <label className="font-medium text-xs">Name</label>
            <Input
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Task name"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="font-medium text-xs">Start</label>
              <Input
                type="date"
                value={start}
                onChange={(e) => onStartChange(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="font-medium text-xs">End</label>
              <Input
                type="date"
                value={end}
                onChange={(e) => onEndChange(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Add resize effect after component definition (cannot be inside earlier return block)
// We augment the component by defining a custom hook-like behavior using prototype patch is overkill; simpler: inline effect inside component was needed.
// For clarity, we re-open TimelineBoard via declaration merging not applicable; we'll move effect inside earlier component body via patch above if needed.

// Utility: ISO week number (simple variant)
function getWeekNumber(date: Date) {
  const tmp = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  // Thursday in current week decides the year.
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return weekNo;
}
