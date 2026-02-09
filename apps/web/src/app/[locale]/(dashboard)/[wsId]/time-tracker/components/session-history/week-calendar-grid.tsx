'use client';

import type { TimeTrackingCategory } from '@tuturuuu/types';
import { useIsMobile } from '@tuturuuu/ui/hooks/use-mobile';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { computeAccessibleLabelStyles } from '@tuturuuu/utils/label-colors';
import dayjs from 'dayjs';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef } from 'react';
import { formatDuration } from '@/lib/time-format';
import type { PeriodStats } from '@/lib/time-tracker-utils';
import type { SessionWithRelations } from '../../types';
import { WeekCalendarLegend } from './week-calendar-legend';
import {
  buildTimeBlocks,
  calculateBlockStyle,
  computeVisibleHourRange,
  HOUR_HEIGHT,
  resolveOverlaps,
  type TimeBlock,
} from './week-calendar-utils';

interface WeekCalendarGridProps {
  sessions: SessionWithRelations[];
  startOfPeriod: dayjs.Dayjs;
  categories: TimeTrackingCategory[] | null;
  userTimezone: string;
  onSessionClick?: (session: SessionWithRelations) => void;
}

export function WeekCalendarGrid({
  sessions,
  startOfPeriod,
  categories,
  userTimezone,
  onSessionClick,
}: WeekCalendarGridProps) {
  const isMobile = useIsMobile();

  const weekStart = useMemo(
    () => startOfPeriod.tz(userTimezone).startOf('isoWeek'),
    [startOfPeriod, userTimezone]
  );

  const blocks = useMemo(() => {
    const raw = buildTimeBlocks(sessions, weekStart, userTimezone);
    return resolveOverlaps(raw);
  }, [sessions, weekStart, userTimezone]);

  const { startHour, endHour } = useMemo(
    () => computeVisibleHourRange(blocks),
    [blocks]
  );

  const todayIndex = useMemo(() => {
    const today = dayjs().tz(userTimezone);
    const diff = today.diff(weekStart, 'day');
    return diff >= 0 && diff < 7 ? diff : -1;
  }, [weekStart, userTimezone]);

  const dayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const day = weekStart.add(i, 'day');
        return {
          short: day.format('ddd'),
          date: day.format('D'),
        };
      }),
    [weekStart]
  );

  const totalHours = endHour - startHour;
  const gridHeight = totalHours * HOUR_HEIGHT;

  // Auto-scroll to current time on mount
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current && todayIndex >= 0) {
      const now = dayjs().tz(userTimezone);
      const currentHour = now.hour() + now.minute() / 60;
      const scrollY = (currentHour - startHour) * HOUR_HEIGHT - 100;
      scrollRef.current.scrollTop = Math.max(0, scrollY);
    }
  }, [todayIndex, startHour, userTimezone]);

  if (isMobile) {
    return (
      <MobileWeekView
        blocks={blocks}
        weekStart={weekStart}
        dayLabels={dayLabels}
        todayIndex={todayIndex}
        categories={categories}
        onSessionClick={onSessionClick}
      />
    );
  }

  return (
    <div className="space-y-3">
      <WeekCalendarLegend categories={categories} />
      <div className="overflow-hidden rounded-lg border">
        <ScrollArea className="h-120" ref={scrollRef}>
          {/* Smart calendar layout: time trail sidebar + flex day columns */}
          <div className="flex" style={{ minWidth: '600px' }}>
            {/* Time trail sidebar — matches smart calendar TimeTrail */}
            <div
              className="relative w-16 shrink-0 border-r"
              style={{ height: `${gridHeight}px` }}
            >
              {Array.from({ length: totalHours }, (_, i) => {
                const hour = startHour + i;
                const label = dayjs().hour(hour).minute(0).format('h A');
                return (
                  <div
                    key={hour}
                    className="absolute flex w-full items-start justify-end pt-0.5 pr-2 text-[10px] text-muted-foreground"
                    style={{
                      top: `${i * HOUR_HEIGHT}px`,
                      height: `${HOUR_HEIGHT}px`,
                    }}
                  >
                    {label}
                  </div>
                );
              })}
            </div>

            {/* Day columns header + grid */}
            <div className="flex flex-1">
              {dayLabels.map((label, dayIdx) => (
                <div
                  key={dayIdx}
                  className={`flex flex-1 flex-col border-l ${
                    dayIdx === todayIndex ? 'bg-dynamic-orange/5' : ''
                  }`}
                >
                  {/* Day header — sticky */}
                  <div
                    className={`sticky top-0 z-20 border-b px-2 py-2 text-center font-medium text-xs ${
                      dayIdx === todayIndex
                        ? 'bg-dynamic-orange/5 text-dynamic-orange'
                        : 'bg-background text-muted-foreground'
                    }`}
                  >
                    <div>{label.short}</div>
                    <div
                      className={`font-semibold text-sm ${
                        dayIdx === todayIndex
                          ? 'text-dynamic-orange'
                          : 'text-foreground'
                      }`}
                    >
                      {label.date}
                    </div>
                  </div>

                  {/* Day column body — relative container for absolute blocks */}
                  <div
                    className="relative"
                    style={{ height: `${gridHeight}px` }}
                  >
                    {/* Hour grid lines */}
                    {Array.from({ length: totalHours }, (_, i) => (
                      <div
                        key={i}
                        className="absolute inset-x-0 border-t"
                        style={{
                          top: `${i * HOUR_HEIGHT}px`,
                          height: `${HOUR_HEIGHT}px`,
                        }}
                      />
                    ))}

                    {/* Session blocks */}
                    <DayColumnBlocks
                      blocks={blocks.filter((b) => b.dayIndex === dayIdx)}
                      visibleStartHour={startHour}
                      onSessionClick={onSessionClick}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}

function DayColumnBlocks({
  blocks,
  visibleStartHour,
  onSessionClick,
}: {
  blocks: TimeBlock[];
  visibleStartHour: number;
  onSessionClick?: (session: SessionWithRelations) => void;
}) {
  const t = useTranslations('time-tracker.session_history');

  return (
    <TooltipProvider delayDuration={200}>
      {blocks.map((block) => {
        const style = calculateBlockStyle(block, visibleStartHour);
        const catStyles = computeAccessibleLabelStyles(
          block.categoryColor || 'GRAY'
        );

        const startTime = dayjs.utc(block.session.start_time).format('h:mm A');
        const endTime = block.session.end_time
          ? dayjs.utc(block.session.end_time).format('h:mm A')
          : t('running');

        const showTitle = block.durationHours >= 0.5;

        return (
          <Tooltip key={block.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  'cursor-pointer overflow-hidden rounded-sm border-l-2 px-1 text-left text-[10px] leading-tight transition-opacity hover:opacity-80',
                  block.isRunning && 'animate-pulse'
                )}
                style={{
                  ...style,
                  backgroundColor: catStyles?.bg,
                  borderColor: catStyles?.border,
                  color: catStyles?.text,
                }}
                onClick={() => onSessionClick?.(block.session)}
                title={t('click_to_edit')}
              >
                {showTitle && (
                  <span className="line-clamp-2 font-medium">
                    {block.title || block.categoryName || t('uncategorized')}
                  </span>
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-56">
              <div className="space-y-1">
                <p className="font-semibold">
                  {block.title || t('uncategorized')}
                </p>
                {block.categoryName && (
                  <p className="text-xs opacity-80">{block.categoryName}</p>
                )}
                <p className="text-xs">
                  {startTime} – {endTime}
                </p>
                <p className="text-xs">
                  {formatDuration(Math.round(block.durationHours * 3600))}
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </TooltipProvider>
  );
}

interface CompactWeekSummaryProps {
  sessions?: SessionWithRelations[];
  periodStats?: PeriodStats;
  startOfPeriod: dayjs.Dayjs;
  categories: TimeTrackingCategory[] | null;
  userTimezone: string;
  onSessionClick?: (session: SessionWithRelations) => void;
}

/**
 * Compact day-by-day summary showing colored category bars per day.
 * Originally the mobile-only view inside WeekCalendarGrid, now exported
 * so it can be rendered independently (always visible above the collapsible).
 */
export function CompactWeekSummary({
  sessions,
  periodStats,
  startOfPeriod,
  categories,
  userTimezone,
  onSessionClick,
}: CompactWeekSummaryProps) {
  const weekStart = useMemo(
    () => startOfPeriod.tz(userTimezone).startOf('isoWeek'),
    [startOfPeriod, userTimezone]
  );

  const blocks = useMemo(() => {
    if (!sessions) return [];
    const raw = buildTimeBlocks(sessions, weekStart, userTimezone);
    return resolveOverlaps(raw);
  }, [sessions, weekStart, userTimezone]);

  const todayIndex = useMemo(() => {
    const today = dayjs().tz(userTimezone);
    const diff = today.diff(weekStart, 'day');
    return diff >= 0 && diff < 7 ? diff : -1;
  }, [weekStart, userTimezone]);

  const dayLabels = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const day = weekStart.add(i, 'day');
        return {
          short: day.format('ddd'),
          date: day.format('D'),
        };
      }),
    [weekStart]
  );

  return (
    <MobileWeekView
      blocks={blocks}
      periodStats={periodStats}
      weekStart={weekStart}
      dayLabels={dayLabels}
      todayIndex={todayIndex}
      categories={categories}
      onSessionClick={onSessionClick}
    />
  );
}

function MobileWeekView({
  blocks,
  periodStats,
  weekStart,
  dayLabels,
  todayIndex,
  categories,
  onSessionClick,
}: {
  blocks: TimeBlock[];
  periodStats?: PeriodStats;
  weekStart: dayjs.Dayjs;
  dayLabels: { short: string; date: string }[];
  todayIndex: number;
  categories: TimeTrackingCategory[] | null;
  onSessionClick?: (session: SessionWithRelations) => void;
}) {
  const dayData = useMemo(() => {
    if (periodStats?.dailyBreakdown && periodStats.dailyBreakdown.length > 0) {
      // Use accurate data from periodStats
      return Array.from({ length: 7 }, (_, dayIdx) => {
        const dateStr = weekStart.add(dayIdx, 'day').format('YYYY-MM-DD');
        const dayStats = periodStats.dailyBreakdown?.find(
          (d) => d.date === dateStr
        );

        if (!dayStats) {
          return {
            dayIdx,
            totalHours: 0,
            segments: [],
            hasRunning: false,
            firstSession: undefined,
          };
        }

        const totalHours = dayStats.totalDuration / 3600;

        return {
          dayIdx,
          totalHours,
          segments: dayStats.breakdown.map((b) => ({
            color: b.color,
            hours: b.duration / 3600,
            percent:
              totalHours > 0 ? (b.duration / 3600 / totalHours) * 100 : 0,
          })),
          // Fallback to blocks for interactivity/running status if available
          hasRunning: blocks
            .filter((b) => b.dayIndex === dayIdx)
            .some((b) => b.isRunning),
          firstSession: blocks.find((b) => b.dayIndex === dayIdx)?.session,
        };
      });
    }

    // Fallback to blocks (paginated data)
    return Array.from({ length: 7 }, (_, dayIdx) => {
      const dayBlocks = blocks.filter((b) => b.dayIndex === dayIdx);
      const totalHours = dayBlocks.reduce((sum, b) => sum + b.durationHours, 0);

      const categorySegments = new Map<
        string,
        { color: string | null; hours: number }
      >();
      for (const b of dayBlocks) {
        const key = b.categoryName ?? '__uncategorized';
        const existing = categorySegments.get(key);
        if (existing) {
          existing.hours += b.durationHours;
        } else {
          categorySegments.set(key, {
            color: b.categoryColor,
            hours: b.durationHours,
          });
        }
      }

      return {
        dayIdx,
        totalHours,
        segments: Array.from(categorySegments.entries()).map(
          ([, { color, hours }]) => ({
            color,
            hours,
            percent: totalHours > 0 ? (hours / totalHours) * 100 : 0,
          })
        ),
        hasRunning: dayBlocks.some((b) => b.isRunning),
        firstSession: dayBlocks[0]?.session,
      };
    });
  }, [blocks, periodStats, weekStart]);

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-lg border p-3">
        <WeekCalendarLegend categories={categories} />
        {dayData.map(
          ({ dayIdx, totalHours, segments, hasRunning, firstSession }) => (
            <button
              type="button"
              key={dayIdx}
              className={`flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted/50 ${
                dayIdx === todayIndex
                  ? 'bg-dynamic-orange/5 ring-1 ring-dynamic-orange/20'
                  : ''
              }`}
              onClick={() => firstSession && onSessionClick?.(firstSession)}
              disabled={totalHours === 0}
            >
              <span
                className={`w-10 shrink-0 font-medium text-xs ${
                  dayIdx === todayIndex
                    ? 'text-dynamic-orange'
                    : 'text-muted-foreground'
                }`}
              >
                {dayLabels[dayIdx]?.short}
              </span>

              <div className="flex h-4 flex-1 overflow-hidden rounded-full bg-muted">
                {segments.map((seg, i) => {
                  const catStyles = computeAccessibleLabelStyles(
                    seg.color || 'GRAY'
                  );
                  return (
                    <div
                      key={i}
                      className={cn(
                        'h-full',
                        hasRunning &&
                          i === segments.length - 1 &&
                          'animate-pulse'
                      )}
                      style={{
                        width: `${seg.percent}%`,
                        backgroundColor: catStyles?.text,
                      }}
                    />
                  );
                })}
              </div>

              <span className="w-16 shrink-0 text-right text-muted-foreground text-xs">
                {totalHours > 0
                  ? formatDuration(Math.round(totalHours * 3600))
                  : '—'}
              </span>
            </button>
          )
        )}
      </div>
    </div>
  );
}
