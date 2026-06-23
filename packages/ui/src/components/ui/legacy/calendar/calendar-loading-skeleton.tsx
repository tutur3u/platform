import { cn } from '@tuturuuu/utils/format';
import type { CalendarView } from '../../../../hooks/use-view-transition';
import { Skeleton } from '../../skeleton';
import { DAY_HEIGHT, HOUR_HEIGHT, MIN_COLUMN_WIDTH } from './config';

function TimedCalendarSkeleton({ columns }: { columns: number }) {
  const eventPlaceholders = [
    { column: 0, hour: 2.2, span: 1.4, width: 0.82 },
    { column: Math.min(1, columns - 1), hour: 5.1, span: 1.1, width: 0.74 },
    {
      column: Math.max(0, columns - 2),
      hour: 8.4,
      span: 1.8,
      width: 0.78,
    },
  ];

  return (
    <div
      className="flex h-full overflow-hidden rounded-b-lg border-border border-b border-l bg-background/50 text-center dark:border-zinc-800"
      style={{ minWidth: `${columns * MIN_COLUMN_WIDTH}px` }}
      aria-hidden="true"
    >
      <div className="w-16 shrink-0 border-r bg-muted/20">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="mx-auto mt-7 h-3 w-9 rounded-sm" />
        ))}
      </div>
      <div
        className="relative grid flex-1"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(${MIN_COLUMN_WIDTH}px, 1fr))`,
          height: `${DAY_HEIGHT}px`,
        }}
      >
        {Array.from({ length: columns }).map((_, index) => (
          <div
            key={index}
            className="relative border-border/70 border-r last:border-r-0"
          >
            {Array.from({ length: 24 }).map((_, hour) => (
              <div
                key={hour}
                className="border-border/50 border-b"
                style={{ height: `${HOUR_HEIGHT}px` }}
              />
            ))}
          </div>
        ))}
        {eventPlaceholders.map((placeholder, index) => (
          <Skeleton
            key={index}
            className="absolute rounded-md"
            style={{
              left: `calc(${(placeholder.column * 100) / columns}% + 6px)`,
              top: `${placeholder.hour * HOUR_HEIGHT}px`,
              width: `calc(${(placeholder.width * 100) / columns}% - 12px)`,
              height: `${placeholder.span * HOUR_HEIGHT}px`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function MonthCalendarSkeleton({ columns }: { columns: number }) {
  return (
    <div
      className="grid h-full min-h-[28rem] gap-px overflow-hidden rounded-lg border bg-border"
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

export function CalendarLoadingSkeleton({
  dates,
  view,
}: {
  dates: Date[];
  view: CalendarView;
}) {
  const columns = Math.max(1, dates.length || (view === 'day' ? 1 : 7));

  if (view === 'month' || view === 'year') {
    return <MonthCalendarSkeleton columns={view === 'year' ? 4 : 7} />;
  }

  if (view === 'agenda') return <AgendaCalendarSkeleton />;

  return (
    <div className="h-full min-h-0 space-y-2" aria-busy="true">
      <div
        className={cn(
          'grid rounded-lg border bg-background/70 p-2',
          columns === 1 && 'max-w-lg'
        )}
        style={{
          gridTemplateColumns: `4rem repeat(${columns}, minmax(${MIN_COLUMN_WIDTH}px, 1fr))`,
        }}
      >
        <Skeleton className="h-5 w-5 self-center justify-self-center rounded-sm" />
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="mx-1 h-5 rounded-sm" />
        ))}
      </div>
      <TimedCalendarSkeleton columns={columns} />
    </div>
  );
}
