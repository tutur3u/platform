import { cn } from '@tuturuuu/utils/format';
import type { CalendarView } from '../../../../hooks/use-view-transition';
import { Skeleton } from '../../skeleton';
import { DAY_HEIGHT, HOUR_HEIGHT, MIN_COLUMN_WIDTH } from './config';

// Placeholder events are drawn inside their own column so that columns hidden
// on narrow screens take their placeholders with them.
const EVENT_PLACEHOLDERS = [
  { hour: 2.2, span: 1.4, width: '82%' },
  { hour: 5.1, span: 1.1, width: '74%' },
  { hour: 8.4, span: 1.8, width: '78%' },
] as const;

// Literal class names so Tailwind can see them. Below `md` every multi-column
// time grid shows one column, matching the Day view that narrow screens use.
const RESPONSIVE_COLUMNS: Record<number, string> = {
  1: 'grid-cols-1',
  4: 'grid-cols-1 md:grid-cols-4',
  7: 'grid-cols-1 md:grid-cols-7',
};

function placeholderForColumn(index: number, columns: number) {
  if (index === 0) return EVENT_PLACEHOLDERS[0];
  if (index === 1) return EVENT_PLACEHOLDERS[1];
  if (columns > 2 && index === columns - 2) return EVENT_PLACEHOLDERS[2];
  return null;
}

function TimedCalendarSkeleton({
  columns,
  responsive = false,
}: {
  columns: number;
  responsive?: boolean;
}) {
  const responsiveColumns = responsive ? RESPONSIVE_COLUMNS[columns] : null;

  return (
    <div
      className="flex h-full overflow-hidden rounded-b-lg border-border border-b border-l bg-background/50 text-center"
      style={
        responsiveColumns
          ? undefined
          : { minWidth: `${columns * MIN_COLUMN_WIDTH}px` }
      }
      aria-hidden="true"
    >
      <div className="w-16 shrink-0 border-r bg-muted/20">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="mx-auto mt-7 h-3 w-9 rounded-sm" />
        ))}
      </div>
      <div
        className={cn('grid flex-1', responsiveColumns)}
        style={{
          gridTemplateColumns: responsiveColumns
            ? undefined
            : `repeat(${columns}, minmax(${MIN_COLUMN_WIDTH}px, 1fr))`,
          height: `${DAY_HEIGHT}px`,
        }}
      >
        {Array.from({ length: columns }).map((_, index) => {
          const placeholder = placeholderForColumn(index, columns);
          return (
            <div
              key={index}
              data-testid="calendar-skeleton-column"
              className={cn(
                'relative border-border/70 border-r last:border-r-0',
                responsiveColumns && index > 0 && 'max-md:hidden'
              )}
            >
              {Array.from({ length: 24 }).map((_, hour) => (
                <div
                  key={hour}
                  className="border-border/50 border-b"
                  style={{ height: `${HOUR_HEIGHT}px` }}
                />
              ))}
              {placeholder && (
                <Skeleton
                  className="absolute left-1.5 rounded-md"
                  style={{
                    top: `${placeholder.hour * HOUR_HEIGHT}px`,
                    width: placeholder.width,
                    height: `${placeholder.span * HOUR_HEIGHT}px`,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthCalendarSkeleton({ columns }: { columns: number }) {
  return (
    <div
      className="grid h-full min-h-112 gap-px overflow-hidden rounded-lg border bg-border"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      aria-hidden="true"
    >
      {Array.from({ length: columns * 5 }).map((_, index) => (
        <div key={index} className="space-y-2 bg-background p-2">
          <Skeleton className="h-3 w-8 rounded-sm" />
          <Skeleton className="h-4 w-4/5 rounded-sm" />
          <Skeleton className="h-4 w-3/5 rounded-sm" />
        </div>
      ))}
    </div>
  );
}

function AgendaCalendarSkeleton() {
  return (
    <div className="space-y-3 rounded-lg border bg-background p-4" aria-hidden>
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <Skeleton className="h-10 w-14 rounded-md" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5 rounded-sm" />
            <Skeleton className="h-3 w-3/5 rounded-sm" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Text-free stand-in for `CalendarHeader`. It uses the same flex structure and
 * control heights so the header row keeps its height at every breakpoint. It
 * renders no dates, because the server and the browser can disagree about the
 * current day.
 */
export function CalendarHeaderSkeleton() {
  return (
    <div
      aria-hidden="true"
      data-testid="calendar-header-skeleton"
      className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-2">
        <Skeleton className="size-5 rounded-sm" />
        <Skeleton className="h-7 w-40 rounded-sm" />
      </div>
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="flex items-center gap-2">
          <div className="flex flex-none items-center gap-2">
            <Skeleton className="size-8 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md" />
            <Skeleton className="size-8 rounded-md" />
          </div>
          <Skeleton className="h-8 w-full flex-1 rounded-md md:w-28" />
          <Skeleton className="size-8 rounded-md" />
        </div>
      </div>
    </div>
  );
}

function timedColumns(view: CalendarView, dateCount: number) {
  if (dateCount > 0) return dateCount;
  if (view === 'day') return 1;
  if (view === '4-days') return 4;
  return 7;
}

export function CalendarLoadingSkeleton({
  dates,
  view,
  responsive = false,
}: {
  dates: Date[];
  view: CalendarView;
  /**
   * Collapse multi-column time grids to one column below `md` with CSS only.
   * Used before the view is resolved, when server and browser output must match.
   */
  responsive?: boolean;
}) {
  if (view === 'month' || view === 'year') {
    return <MonthCalendarSkeleton columns={view === 'year' ? 4 : 7} />;
  }

  if (view === 'agenda') return <AgendaCalendarSkeleton />;

  const columns = timedColumns(view, dates.length);

  return (
    <div className="h-full min-h-0" aria-busy="true">
      <TimedCalendarSkeleton columns={columns} responsive={responsive} />
    </div>
  );
}

/**
 * The calendar before its view and dates are resolved: a header placeholder
 * and a body placeholder in the same grid the resolved calendar uses, so the
 * area never renders empty and the header row keeps its height.
 */
export function CalendarFirstPaintSkeleton({ view }: { view: CalendarView }) {
  return (
    <div
      aria-busy="true"
      data-testid="calendar-first-paint-skeleton"
      className="grid h-full min-h-0 w-full grid-rows-[auto_1fr]"
    >
      <CalendarHeaderSkeleton />
      <div className="min-h-0 overflow-hidden rounded-lg">
        <CalendarLoadingSkeleton dates={[]} view={view} responsive />
      </div>
    </div>
  );
}
