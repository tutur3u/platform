import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';

/**
 * Miniature, purely decorative product visuals for the bento grid.
 *
 * These are static CSS/SVG compositions — no data fetching, no chart library,
 * no motion runtime. They exist so the grid shows what the products look like
 * instead of asking the reader to imagine it from an icon.
 */

function PreviewFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative h-fit w-full overflow-hidden rounded-xl border border-foreground/10 bg-background/50 p-3 shadow-foreground/5 shadow-sm',
        className
      )}
    >
      {children}
    </div>
  );
}

const dayLabels = ['M', 'T', 'W', 'T', 'F'];

/** Calendar: a work week with auto-scheduled focus blocks. */
export function CalendarPreview() {
  const blocks = [
    { day: 0, top: 12, height: 26, tone: 'bg-dynamic-blue/30' },
    { day: 1, top: 30, height: 34, tone: 'bg-dynamic-purple/30' },
    { day: 2, top: 8, height: 20, tone: 'bg-dynamic-blue/20' },
    { day: 2, top: 44, height: 30, tone: 'bg-dynamic-cyan/30' },
    { day: 3, top: 22, height: 44, tone: 'bg-dynamic-blue/35' },
    { day: 4, top: 16, height: 24, tone: 'bg-dynamic-green/25' },
  ];

  return (
    <PreviewFrame>
      <div className="mb-2 flex items-center justify-between font-mono-ui text-[0.6rem] text-foreground/35 uppercase tracking-[0.18em]">
        <span>Week</span>
        <span className="text-dynamic-blue/70">Auto</span>
      </div>
      <div className="grid h-20 grid-cols-5 gap-1.5 sm:h-24">
        {dayLabels.map((label, day) => (
          <div className="relative" key={`${label}-${day}`}>
            <div className="absolute inset-0 rounded-md bg-foreground/[0.04]" />
            {blocks
              .filter((block) => block.day === day)
              .map((block) => (
                <div
                  className={cn(
                    'absolute inset-x-0 rounded-[3px] border-dynamic-blue/40 border-l-2',
                    block.tone
                  )}
                  key={`${block.day}-${block.top}`}
                  style={{ top: `${block.top}%`, height: `${block.height}%` }}
                />
              ))}
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1.5 text-center font-mono-ui text-[0.55rem] text-foreground/30">
        {dayLabels.map((label, index) => (
          <span key={`label-${label}-${index}`}>{label}</span>
        ))}
      </div>
    </PreviewFrame>
  );
}

/** Tasks: three-column board with weighted cards. */
export function TasksPreview() {
  const columns = [
    { widths: [100, 72], tone: 'bg-dynamic-orange/40' },
    { widths: [100, 88, 60], tone: 'bg-dynamic-blue/40' },
    { widths: [100], tone: 'bg-dynamic-green/40' },
  ];

  return (
    <PreviewFrame>
      <div className="grid grid-cols-3 gap-1.5">
        {columns.map((column, columnIndex) => (
          <div
            className="rounded-md bg-foreground/[0.04] p-1.5"
            key={`column-${columnIndex}`}
          >
            <div
              className={cn('mb-1.5 h-1 w-5 rounded-full', column.tone)}
              key="head"
            />
            <div className="grid gap-1">
              {column.widths.map((width, cardIndex) => (
                <div
                  className="rounded-[4px] border border-foreground/10 bg-background/70 p-1"
                  key={`card-${columnIndex}-${cardIndex}`}
                >
                  <div
                    className="h-1 rounded-full bg-foreground/20"
                    style={{ width: `${width}%` }}
                  />
                  <div className="mt-1 h-1 w-1/2 rounded-full bg-foreground/10" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </PreviewFrame>
  );
}

/** Meet: availability heatmap with the winning slot called out. */
export function MeetPreview() {
  // Deterministic pseudo-density so the heatmap reads as real availability.
  const density = [
    1, 2, 3, 3, 2, 1, 2, 3, 4, 4, 3, 2, 1, 2, 4, 4, 3, 1, 0, 1, 3, 4, 2, 1, 1,
    2, 2, 3, 2, 0,
  ];
  const tones = [
    'bg-foreground/[0.05]',
    'bg-dynamic-purple/15',
    'bg-dynamic-purple/30',
    'bg-dynamic-purple/50',
    'bg-dynamic-purple/75',
  ];

  return (
    <PreviewFrame>
      <div className="mb-2 flex items-center justify-between font-mono-ui text-[0.6rem] text-foreground/35 uppercase tracking-[0.18em]">
        <span>Overlap</span>
        <span className="text-dynamic-purple/80">8/9</span>
      </div>
      <div className="grid grid-cols-6 gap-1">
        {density.map((level, index) => (
          <div
            className={cn(
              'aspect-square rounded-[3px]',
              tones[level],
              level === 4 && 'ring-1 ring-dynamic-purple/60'
            )}
            key={`cell-${index}`}
          />
        ))}
      </div>
    </PreviewFrame>
  );
}

/** Chat: a thread where the assistant lifts a commitment into a task. */
export function ChatPreview() {
  return (
    <PreviewFrame>
      <div className="grid gap-1.5">
        <div className="flex justify-start">
          <div className="w-[72%] rounded-lg rounded-bl-sm bg-foreground/[0.07] p-1.5">
            <div className="h-1 w-full rounded-full bg-foreground/20" />
            <div className="mt-1 h-1 w-2/3 rounded-full bg-foreground/12" />
          </div>
        </div>
        <div className="flex justify-end">
          <div className="w-[58%] rounded-lg rounded-br-sm bg-dynamic-cyan/20 p-1.5">
            <div className="h-1 w-full rounded-full bg-dynamic-cyan/50" />
          </div>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 rounded-lg border border-dynamic-cyan/25 bg-dynamic-cyan/10 p-1.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-dynamic-cyan" />
          <span className="h-1 w-2/3 rounded-full bg-dynamic-cyan/40" />
        </div>
      </div>
    </PreviewFrame>
  );
}

/** Finance: monthly bars with a trend baseline. */
export function FinancePreview() {
  const bars = [38, 52, 44, 68, 58, 76, 64, 88];

  return (
    <PreviewFrame>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-mono-ui text-[0.6rem] text-foreground/35 uppercase tracking-[0.18em]">
          Net
        </span>
        <span className="font-mono-ui text-[0.65rem] text-dynamic-pink/80 tabular-nums">
          +18.4%
        </span>
      </div>
      <div className="flex h-16 items-end gap-1.5 sm:h-20">
        {bars.map((height, index) => (
          <div
            className={cn(
              'flex-1 rounded-t-[3px]',
              index === bars.length - 1
                ? 'bg-dynamic-pink/70'
                : 'bg-dynamic-pink/25'
            )}
            key={`bar-${index}`}
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
    </PreviewFrame>
  );
}

/** Nova: leaderboard rows with a progress rail. */
export function NovaPreview() {
  const rows = [
    { width: 92, tone: 'bg-dynamic-orange/70' },
    { width: 74, tone: 'bg-dynamic-orange/45' },
    { width: 51, tone: 'bg-dynamic-orange/30' },
  ];

  return (
    <PreviewFrame>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-mono-ui text-[0.6rem] text-foreground/35 uppercase tracking-[0.18em]">
          Rank
        </span>
        <span className="font-mono-ui text-[0.65rem] text-dynamic-orange/80 tabular-nums">
          2,480 XP
        </span>
      </div>
      <div className="grid gap-2">
        {rows.map((row, index) => (
          <div className="flex items-center gap-2" key={`row-${index}`}>
            <span className="w-3 font-mono-ui text-[0.55rem] text-foreground/30 tabular-nums">
              {index + 1}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
              <div
                className={cn('h-full rounded-full', row.tone)}
                style={{ width: `${row.width}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </PreviewFrame>
  );
}

export const productPreviews = {
  tuplan: CalendarPreview,
  tudo: TasksPreview,
  tumeet: MeetPreview,
  tuchat: ChatPreview,
  tufinance: FinancePreview,
  nova: NovaPreview,
} as const;
