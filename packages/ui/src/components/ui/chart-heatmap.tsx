'use client';

import { cn } from '@tuturuuu/utils/format';
import {
  type KeyboardEvent,
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChartTooltipFrame } from './chart';

export type ChartHeatmapRow = {
  key: string;
  label: ReactNode;
  /** The row's name as text, for the cell's accessible name. */
  name: string;
  values: readonly number[];
};

export type ChartHeatmapColumn = {
  key: string;
  /** Full name, used in the tooltip and each cell's accessible name. */
  label: string;
  /** Short tick shown above the grid; omit for no tick. */
  tick?: string;
};

export type ChartHeatmapProps = {
  rows: readonly ChartHeatmapRow[];
  columns: readonly ChartHeatmapColumn[];
  /** Accessible name of the grid. */
  label: string;
  /** "12 commits" for a cell's value. */
  valueLabel: (value: number) => string;
  legend?: { less: string; more: string };
  className?: string;
};

const SHADES = [0, 32, 56, 80, 100] as const;
const LABEL_WIDTH = '7.5rem';
const CELL_MIN = 24;

function shade(value: number, max: number) {
  if (value <= 0 || max <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil(4 * Math.sqrt(value / max))));
}

/**
 * A grid of values with one hue (more is darker). A single tooltip follows
 * hover, focus and tap; arrow keys, Home and End move between cells, and every
 * cell is named "row, column: value". Wide grids scroll sideways under sticky
 * row labels.
 */
export function ChartHeatmap({
  rows,
  columns,
  label,
  valueLabel,
  legend,
  className,
}: ChartHeatmapProps) {
  const max = useMemo(
    () => Math.max(0, ...rows.flatMap((row) => row.values)),
    [rows]
  );
  const [active, setActive] = useState<[number, number] | null>(null);
  const [rovingRow, rovingColumn] = active ?? [0, columns.length - 1];
  const frame = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{
    x: number;
    y: number;
    below: boolean;
  } | null>(null);

  useLayoutEffect(() => {
    const host = frame.current;
    const cell = active
      ? host?.querySelector<HTMLElement>(
          `[data-cell="${active[0]}-${active[1]}"]`
        )
      : null;
    if (!host || !cell) {
      setPlace(null);
      return;
    }
    const half = (tip.current?.offsetWidth ?? 0) / 2;
    const center = cell.offsetLeft + cell.offsetWidth / 2;
    // Above the cell, or below it where the scroll area would clip it.
    const below = cell.offsetTop < (tip.current?.offsetHeight ?? 0) + 40;
    setPlace({
      x: Math.min(Math.max(center, half), host.offsetWidth - half),
      y: below ? cell.offsetTop + cell.offsetHeight + 6 : cell.offsetTop - 6,
      below,
    });
  }, [active]);

  const move = (event: KeyboardEvent, row: number, column: number) => {
    const last = columns.length - 1;
    const next: Record<string, [number, number]> = {
      ArrowRight: [row, Math.min(last, column + 1)],
      ArrowLeft: [row, Math.max(0, column - 1)],
      ArrowDown: [Math.min(rows.length - 1, row + 1), column],
      ArrowUp: [Math.max(0, row - 1), column],
      Home: [row, 0],
      End: [row, last],
    };
    if (event.key === 'Escape') return setActive(null);
    const target = next[event.key];
    if (!target) return;
    event.preventDefault();
    setActive(target);
    frame.current
      ?.querySelector<HTMLElement>(`[data-cell="${target[0]}-${target[1]}"]`)
      ?.focus();
  };

  const [row, column] = active ?? [-1, -1];
  const hovered = row >= 0 ? rows[row] : undefined;
  const template = `${LABEL_WIDTH} repeat(${columns.length}, minmax(${CELL_MIN}px, 1fr))`;

  return (
    <div className={cn('grid min-w-0 gap-3', className)}>
      <div
        className="overflow-x-auto pb-1"
        ref={(node) => {
          if (node && !node.dataset.scrolled) {
            node.dataset.scrolled = '';
            node.scrollLeft = node.scrollWidth;
          }
        }}
      >
        <div
          ref={frame}
          role="grid"
          aria-label={label}
          aria-rowcount={rows.length}
          aria-colcount={columns.length}
          className="relative grid gap-y-1"
          style={{
            minWidth: `calc(${LABEL_WIDTH} + ${columns.length * (CELL_MIN + 4)}px)`,
          }}
          onPointerLeave={() => setActive(null)}
        >
          <div
            role="row"
            aria-hidden="true"
            className="grid gap-x-1 text-muted-foreground text-xs"
            style={{ gridTemplateColumns: template }}
          >
            <span className="sticky left-0 z-10 bg-card" />
            {columns.map(({ key, tick }, index) => (
              <span
                key={key}
                className={cn(
                  'overflow-visible whitespace-nowrap',
                  index === columns.length - 1 && 'justify-self-end'
                )}
              >
                {tick}
              </span>
            ))}
          </div>
          {rows.map((entry, r) => (
            <div
              key={entry.key}
              role="row"
              className="grid items-center gap-x-1"
              style={{ gridTemplateColumns: template }}
            >
              <span
                role="rowheader"
                className="sticky left-0 z-10 flex w-full items-center gap-2 self-stretch truncate bg-card pr-2 text-foreground text-xs"
              >
                {entry.label}
              </span>
              {columns.map((col, c) => {
                const value = entry.values[c] ?? 0;
                const level = shade(value, max);
                return (
                  <button
                    key={col.key}
                    type="button"
                    role="gridcell"
                    data-cell={`${r}-${c}`}
                    data-level={level}
                    aria-describedby={
                      r === row && c === column ? 'heatmap-tip' : undefined
                    }
                    aria-label={`${entry.name}, ${col.label}: ${valueLabel(value)}`}
                    tabIndex={r === rovingRow && c === rovingColumn ? 0 : -1}
                    className="h-6 min-w-0 rounded-[4px] outline-ring/50 focus-visible:outline-2 focus-visible:outline-offset-1 data-[level=0]:bg-muted"
                    style={
                      level
                        ? {
                            backgroundColor: `color-mix(in oklab, var(--chart-1) ${SHADES[level]}%, var(--muted))`,
                          }
                        : undefined
                    }
                    onPointerEnter={() => setActive([r, c])}
                    onPointerDown={(event) => {
                      if (event.pointerType !== 'mouse') setActive([r, c]);
                    }}
                    onFocus={() => setActive([r, c])}
                    onKeyDown={(event) => move(event, r, c)}
                  />
                );
              })}
            </div>
          ))}
          {hovered && (
            <ChartTooltipFrame
              ref={tip}
              id="heatmap-tip"
              role="tooltip"
              className={cn(
                'pointer-events-none absolute z-20 w-max max-w-56 -translate-x-1/2',
                !place?.below && '-translate-y-full'
              )}
              style={{
                left: place?.x ?? 0,
                top: place?.y ?? 0,
                visibility: place ? 'visible' : 'hidden',
              }}
            >
              <span className="font-medium">{columns[column]?.label}</span>
              <span className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{hovered.name}</span>
                <span className="font-medium font-mono tabular-nums">
                  {valueLabel(hovered.values[column] ?? 0)}
                </span>
              </span>
            </ChartTooltipFrame>
          )}
        </div>
      </div>
      {legend && (
        <div
          aria-hidden="true"
          className="flex items-center gap-1.5 text-muted-foreground text-xs"
        >
          {legend.less}
          {SHADES.map((pct, level) => (
            <span
              key={pct}
              className="size-3.5 rounded-[3px] bg-muted"
              style={
                level
                  ? {
                      backgroundColor: `color-mix(in oklab, var(--chart-1) ${pct}%, var(--muted))`,
                    }
                  : undefined
              }
            />
          ))}
          {legend.more}
        </div>
      )}
    </div>
  );
}
