'use client';

import { cn } from '@tuturuuu/utils/format';
import { useMemo } from 'react';

export interface ActivityHeatmapDatum {
  date: string;
  value: number;
}

interface ActivityHeatmapProps {
  data: ActivityHeatmapDatum[];
  /** Number of trailing weeks to render (default 53 = ~1 year). */
  weeks?: number;
  /** ISO date (YYYY-MM-DD) of the last column; defaults to today (local). */
  endDate?: string;
  /** Unit label shown in tooltips, e.g. "words". */
  unitLabel?: string;
  /**
   * Ordered intensity classes from lowest (empty) to highest.
   * Must be literal Tailwind class strings so JIT can see them.
   */
  levelClasses?: [string, string, string, string, string];
  className?: string;
  /** Called with the ISO date when a day cell is activated. */
  onSelectDate?: (date: string) => void;
}

const DEFAULT_LEVELS: [string, string, string, string, string] = [
  'bg-foreground/[0.06]',
  'bg-dynamic-green/25',
  'bg-dynamic-green/45',
  'bg-dynamic-green/70',
  'bg-dynamic-green',
];

const WEEKDAY_LABELS: Array<{ id: string; label: string }> = [
  { id: 'sun', label: '' },
  { id: 'mon', label: 'Mon' },
  { id: 'tue', label: '' },
  { id: 'wed', label: 'Wed' },
  { id: 'thu', label: '' },
  { id: 'fri', label: 'Fri' },
  { id: 'sat', label: '' },
];
const MS_PER_DAY = 86_400_000;

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

function parseIsoDate(value: string) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/**
 * GitHub-style contribution heatmap. Columns are weeks (Sunday-started),
 * rows are weekdays. Intensity is quantized against the dataset's non-zero
 * distribution so a single big day never washes out the rest.
 */
export function ActivityHeatmap({
  data,
  weeks = 53,
  endDate,
  unitLabel = '',
  levelClasses = DEFAULT_LEVELS,
  className,
  onSelectDate,
}: ActivityHeatmapProps) {
  const { columns, monthLabels, thresholds } = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const entry of data) {
      if (!entry?.date) continue;
      byDate.set(
        entry.date,
        (byDate.get(entry.date) ?? 0) + Number(entry.value || 0)
      );
    }

    // Anchor the grid to the Saturday at or after endDate so the final
    // (rightmost) column always contains "today".
    const anchor = endDate ? parseIsoDate(endDate) : new Date();
    anchor.setHours(0, 0, 0, 0);
    const lastColumnEnd = new Date(anchor);
    lastColumnEnd.setDate(
      lastColumnEnd.getDate() + (6 - lastColumnEnd.getDay())
    );

    const totalDays = weeks * 7;
    const gridStart = new Date(
      lastColumnEnd.getTime() - (totalDays - 1) * MS_PER_DAY
    );

    const cols: Array<
      Array<{ date: string; value: number; inFuture: boolean }>
    > = [];
    const months: Array<{ index: number; label: string }> = [];
    const monthFormatter = new Intl.DateTimeFormat(undefined, {
      month: 'short',
    });
    let lastMonth = -1;
    const todayIso = toIsoDate(new Date());

    for (let w = 0; w < weeks; w++) {
      const col: Array<{ date: string; value: number; inFuture: boolean }> = [];
      for (let day = 0; day < 7; day++) {
        const cellDate = new Date(
          gridStart.getTime() + (w * 7 + day) * MS_PER_DAY
        );
        const iso = toIsoDate(cellDate);
        col.push({
          date: iso,
          value: byDate.get(iso) ?? 0,
          inFuture: iso > todayIso,
        });
        if (day === 0) {
          const month = cellDate.getMonth();
          if (month !== lastMonth) {
            months.push({ index: w, label: monthFormatter.format(cellDate) });
            lastMonth = month;
          }
        }
      }
      cols.push(col);
    }

    // Quartile thresholds over positive values for balanced shading.
    const positives = [...byDate.values()]
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
    const quantile = (q: number) =>
      positives.length === 0
        ? 0
        : (positives[
            Math.min(positives.length - 1, Math.floor(q * positives.length))
          ] ?? 0);

    return {
      columns: cols,
      monthLabels: months,
      thresholds: [quantile(0.25), quantile(0.5), quantile(0.75)],
    };
  }, [data, weeks, endDate]);

  const levelFor = (value: number) => {
    if (value <= 0) return 0;
    if (value <= thresholds[0]!) return 1;
    if (value <= thresholds[1]!) return 2;
    if (value <= thresholds[2]!) return 3;
    return 4;
  };

  const numberFormatter = useMemo(() => new Intl.NumberFormat(), []);
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }),
    []
  );

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <div className="inline-flex min-w-full flex-col gap-1.5">
        {/* Month labels */}
        <div className="flex pl-8 text-[10px] text-muted-foreground">
          <div className="relative flex-1" style={{ height: 12 }}>
            {monthLabels.map((month) => (
              <span
                className="absolute top-0"
                key={`${month.label}-${month.index}`}
                style={{ left: `${(month.index / columns.length) * 100}%` }}
              >
                {month.label}
              </span>
            ))}
          </div>
        </div>

        <div className="flex gap-1.5">
          {/* Weekday labels */}
          <div className="flex w-6 shrink-0 flex-col justify-between py-0.5 text-[9px] text-muted-foreground">
            {WEEKDAY_LABELS.map((weekday) => (
              <span className="h-3 leading-3" key={weekday.id}>
                {weekday.label}
              </span>
            ))}
          </div>

          {/* Week columns */}
          <div className="flex gap-[3px]">
            {columns.map((col, weekIndex) => (
              <div
                className="flex flex-col gap-[3px]"
                key={col[0]?.date ?? weekIndex}
              >
                {col.map((cell) => {
                  if (cell.inFuture) {
                    return (
                      <div
                        className="size-3 rounded-[3px] bg-transparent"
                        key={cell.date}
                      />
                    );
                  }
                  const level = levelFor(cell.value);
                  const title =
                    cell.value > 0
                      ? `${numberFormatter.format(cell.value)}${unitLabel ? ` ${unitLabel}` : ''} · ${dateFormatter.format(parseIsoDate(cell.date))}`
                      : `No activity · ${dateFormatter.format(parseIsoDate(cell.date))}`;
                  const interactive = Boolean(onSelectDate);
                  return (
                    <button
                      aria-label={title}
                      className={cn(
                        'size-3 rounded-[3px] ring-offset-background transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-dynamic-blue focus-visible:ring-offset-1',
                        levelClasses[level],
                        interactive && 'cursor-pointer hover:scale-125'
                      )}
                      disabled={!interactive}
                      key={cell.date}
                      onClick={
                        interactive
                          ? () => onSelectDate?.(cell.date)
                          : undefined
                      }
                      title={title}
                      type="button"
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-1.5 pl-8 text-[10px] text-muted-foreground">
          <span>Less</span>
          {levelClasses.map((levelClass) => (
            <span
              className={cn('size-3 rounded-[3px]', levelClass)}
              key={levelClass}
            />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}
