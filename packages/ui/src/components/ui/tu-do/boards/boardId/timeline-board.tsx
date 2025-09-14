'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskBoard } from '@tuturuuu/types/primitives/TaskBoard';
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
import { Clock, Info } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export interface TimelineProps {
  board: TaskBoard & { tasks: Task[]; lists: TaskList[] };
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
  const DAY = 24 * 60 * 60 * 1000;
  const datedTasks: TimelineSpan[] = [];
  const unscheduled: Task[] = [];
  const listById = new Map(lists.map((l) => [String(l.id), l] as const));
  const today = new Date();
  const todayMid = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  for (const task of tasks) {
    if (!task.start_date && !task.end_date) {
      unscheduled.push(task);
      continue;
    }
    // Derive start/end
    const rawStart = task.start_date
      ? new Date(task.start_date)
      : task.end_date
        ? new Date(task.end_date)
        : todayMid;
    const rawEnd = task.end_date ? new Date(task.end_date) : rawStart;
    // Normalize to midnight boundaries
    const start = new Date(
      rawStart.getFullYear(),
      rawStart.getMonth(),
      rawStart.getDate()
    );
    const end = new Date(
      rawEnd.getFullYear(),
      rawEnd.getMonth(),
      rawEnd.getDate()
    );
    const durationDays = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / DAY) + 1
    );
    const list = listById.get(String(task.list_id));
    const span: Omit<TimelineSpan, 'rowIndex'> = {
      task,
      start,
      end,
      durationDays,
      list,
      isPast: end < todayMid,
      isOngoing: start <= todayMid && end >= todayMid,
      isFuture: start > todayMid,
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
    : todayMid;
  const maxDate = datedTasks.length
    ? datedTasks.reduce(
        (max, s) => (s.end > max ? s.end : max),
        datedTasks[0]!.end
      )
    : todayMid;

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
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

// Nice label for a date (month change markers)
function formatDayLabel(d: Date) {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Week boundary check
function isWeekStart(d: Date) {
  return d.getDay() === 1; // Monday start convention
}

// --- Component -------------------------------------------------------------
export function TimelineBoard({
  board,
  className,
  onTaskPartialUpdate,
}: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<'day' | 'week'>('day');
  const [density, setDensity] = useState<
    'compact' | 'comfortable' | 'expanded'
  >('comfortable');
  // Local editable tasks copy for optimistic UI
  const [localTasks, setLocalTasks] = useState<Task[]>(board.tasks);
  // Re-sync when source changes (unless actively resizing/editing)
  useEffect(() => {
    setLocalTasks(board.tasks);
  }, [board.tasks]);

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
    () => computeTimelineSpans(tasksForCompute, board.lists),
    [tasksForCompute, board.lists]
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
    const todayIndex = days.findIndex((d) => {
      const now = new Date();
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    });
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

  const today = new Date();
  const todayMid = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

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

  // Recenter on today when density changes to keep context
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const todayIndex = days.findIndex((d) => {
      const now = new Date();
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    });
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
    const DAY_MS = 24 * 60 * 60 * 1000;
    const normalize = (d: Date) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate());

    const applyDraft = (dayDelta: number) => {
      if (!resizing) return;
      let newStart = new Date(resizing.originalStart);
      let newEnd = new Date(resizing.originalEnd);
      if (resizing.side === 'start') {
        newStart.setDate(newStart.getDate() + dayDelta);
        // Clamp not after end - ensure at least 1 day
        if (newStart > newEnd) newStart = new Date(newEnd.getTime());
      } else {
        newEnd.setDate(newEnd.getDate() + dayDelta);
        if (newEnd < newStart) newEnd = new Date(newStart.getTime());
      }
      // Enforce inclusive duration >= 1 day
      if (Math.round((newEnd.getTime() - newStart.getTime()) / DAY_MS) < 0) {
        // adjust depending on edge
        if (resizing.side === 'start') newStart = new Date(newEnd.getTime());
        else newEnd = new Date(newStart.getTime());
      }
      newStart = normalize(newStart);
      newEnd = normalize(newEnd);
      setResizeDraft({
        [resizing.taskId]: { start: newStart, end: newEnd },
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
        setLocalTasks(board.tasks);
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
  }, [resizing, dayWidth, resizeDraft, board.tasks, onTaskPartialUpdate]);

  return (
    <>
      <section
        className={cn('flex h-full flex-col overflow-hidden', className)}
        aria-label="Timeline view"
      >
        <div className="flex items-center justify-between gap-4 border-b bg-background/80 px-2 py-2 backdrop-blur-sm md:px-4">
          <div className="flex items-center gap-3 text-muted-foreground text-sm">
            <Clock className="h-4 w-4" />
            <span>
              {spans.length} scheduled task{spans.length !== 1 ? 's' : ''}
            </span>
            {unscheduled.length > 0 && (
              <span className="rounded bg-dynamic-amber/20 px-2 py-0.5 text-dynamic-amber/90 text-xs">
                {unscheduled.length} unscheduled
              </span>
            )}
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline focus:outline-none"
                    aria-label="Timeline help"
                  >
                    <Info className="h-3.5 w-3.5" /> Help
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  Drag horizontally (trackpad / shift+wheel) to explore. Bars
                  show task duration. Today is highlighted.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center overflow-hidden rounded-md border bg-background/60 md:flex">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={() => adjustDensity(-1)}
                disabled={density === 'compact'}
              >
                -
              </Button>
              <span className="min-w-[86px] select-none px-2 text-center text-[11px] capitalize tracking-wide">
                {density}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px]"
                onClick={() => adjustDensity(1)}
                disabled={density === 'expanded'}
              >
                +
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={toggleScale}
              className="h-7 px-2 text-xs"
            >
              {scale === 'day' ? 'Week view' : 'Day view'}
            </Button>
          </div>
        </div>

        <div className="relative flex-1 overflow-hidden">
          <div
            ref={containerRef}
            className="relative h-full w-full overflow-auto"
            aria-describedby="timeline-help"
          >
            {/* Header grid (CSS Grid for perfect alignment) */}
            <div
              className="sticky top-0 z-20 grid border-b bg-background/95 shadow-sm backdrop-blur"
              style={{ width: totalWidth, gridTemplateColumns: dayTemplate }}
            >
              {days.map((d, idx) => {
                const isToday = d.getTime() === todayMid.getTime();
                return (
                  <div
                    key={idx}
                    className={cn(
                      'relative flex h-12 flex-col items-center justify-center font-medium text-[10px] md:text-xs',
                      isToday && 'bg-dynamic-blue/15 text-dynamic-blue'
                    )}
                    data-today={isToday || undefined}
                  >
                    <span className="leading-tight">{formatDayLabel(d)}</span>
                    <span
                      className={cn(
                        'mt-0.5 text-[9px] opacity-0',
                        isWeekStart(d) && 'opacity-60'
                      )}
                    >
                      W{getWeekNumber(d)}
                    </span>
                    {isToday && (
                      <span className="absolute inset-x-1 bottom-0 h-1 rounded-full bg-dynamic-blue/60" />
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
                  className="pointer-events-none absolute top-12 bottom-0 z-10 w-px bg-dynamic-blue/70"
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
                    ? 'bg-dynamic-green/50 border-dynamic-green/60'
                    : span.isOngoing
                      ? 'bg-dynamic-blue/40 border-dynamic-blue/60'
                      : span.isFuture
                        ? 'bg-dynamic-purple/40 border-dynamic-purple/60'
                        : 'bg-dynamic-foreground/30 border-dynamic-foreground/40';
                return (
                  <TooltipProvider key={span.task.id} delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            'group relative col-span-[var(--col-span)] col-start-[var(--col-start)] row-start-[var(--row-start)] flex h-full items-start justify-start rounded-md border px-2 py-1 text-left text-[11px] text-foreground/90 leading-tight shadow-sm outline-none ring-offset-background backdrop-blur-sm transition-shadow focus-visible:ring-2 focus-visible:ring-dynamic-blue/60',
                            statusColor,
                            resizing?.taskId === span.task.id &&
                              'border-dynamic-blue/70 ring-1 ring-dynamic-blue/40'
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
                            setEditStart(span.start.toISOString().slice(0, 10));
                            setEditEnd(span.end.toISOString().slice(0, 10));
                          }}
                        >
                          <div className="flex w-full flex-col">
                            <div className="flex items-center gap-1 pr-2">
                              <span className="truncate font-medium text-[11px] tracking-tight">
                                {span.task.name}
                              </span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-1 text-[9px] opacity-70">
                              <span>{span.durationDays}d</span>
                              {span.list?.status && (
                                <span className="rounded bg-background/40 px-1 py-px">
                                  {span.list.status}
                                </span>
                              )}
                            </div>
                            {/* Resize handles */}
                            <div
                              className="absolute inset-y-0 left-0 w-2 cursor-col-resize rounded-l-md bg-gradient-to-r from-background/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
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
                              className="absolute inset-y-0 right-0 w-2 cursor-col-resize rounded-r-md bg-gradient-to-l from-background/40 to-transparent opacity-0 transition-opacity group-hover:opacity-100"
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
                      <TooltipContent className="max-w-xs">
                        <p className="mb-1 font-medium text-sm">
                          {span.task.name}
                        </p>
                        <p className="text-xs opacity-80">
                          {span.start.toDateString()} –{' '}
                          {span.end.toDateString()}
                        </p>
                        {span.task.description && (
                          <p className="mt-2 line-clamp-4 text-xs opacity-70">
                            {span.task.description}
                          </p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                );
              })}

              {/* Unscheduled bucket */}
              {unscheduled.length > 0 && (
                <div className="mt-10 space-y-2">
                  <div className="mb-1 flex items-center gap-2 pl-2 font-medium text-muted-foreground text-xs">
                    <span className="h-2 w-2 rounded-full bg-dynamic-amber/70" />{' '}
                    Unscheduled ({unscheduled.length})
                  </div>
                  <div className="flex flex-wrap gap-2 pl-2">
                    {unscheduled.slice(0, 40).map((t) => (
                      <div
                        key={t.id}
                        className="rounded border bg-background/60 px-2 py-1 text-[11px] shadow-sm hover:bg-background/80"
                      >
                        {t.name}
                      </div>
                    ))}
                    {unscheduled.length > 40 && (
                      <div className="text-[11px] italic opacity-60">
                        +{unscheduled.length - 40} more…
                      </div>
                    )}
                  </div>
                </div>
              )}
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

            const startISO = startStr ? new Date(startStr).toISOString() : null;
            const endISO = endStr ? new Date(endStr).toISOString() : null;

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
