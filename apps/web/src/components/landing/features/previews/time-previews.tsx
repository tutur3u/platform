import { cn } from '@tuturuuu/utils/format';
import { Line, PreviewFrame, PreviewHeader } from './frame';

/** Previews for the apps that deal in time: calendar, tasks, meet, tracking. */

const dayLabels = ['M', 'T', 'W', 'T', 'F'];

/**
 * Calendar: a work week the scheduler has already laid out.
 *
 * The hatched block is protected focus time, the ring marks the block AI moved
 * to make room, and the hairline is the current moment — three details that
 * turn a grid of rectangles into a schedule someone actually lives in.
 */
export function CalendarPreview() {
  const blocks = [
    { day: 0, top: 10, height: 24, tone: 'bg-dynamic-blue/30' },
    { day: 0, top: 62, height: 18, tone: 'bg-dynamic-cyan/25' },
    { day: 1, top: 28, height: 34, tone: 'bg-dynamic-purple/30' },
    { day: 2, top: 6, height: 18, tone: 'bg-dynamic-blue/20' },
    { day: 2, top: 42, height: 32, tone: 'bg-dynamic-cyan/30', moved: true },
    { day: 3, top: 20, height: 46, tone: 'bg-dynamic-blue/35', focus: true },
    { day: 4, top: 14, height: 22, tone: 'bg-dynamic-green/25' },
    { day: 4, top: 58, height: 26, tone: 'bg-dynamic-blue/25' },
  ];

  return (
    <PreviewFrame>
      <PreviewHeader
        label="Week"
        value="Auto"
        valueClassName="text-dynamic-blue/70"
      />

      <div className="relative grid h-20 grid-cols-5 gap-1.5 sm:h-24">
        {dayLabels.map((label, day) => (
          <div className="relative" key={`col-${label}-${day}`}>
            <span className="absolute inset-0 rounded-md bg-foreground/[0.04]" />
            {blocks
              .filter((block) => block.day === day)
              .map((block) => (
                <span
                  className={cn(
                    'absolute inset-x-0 overflow-hidden rounded-[3px] border-dynamic-blue/40 border-l-2',
                    block.tone,
                    block.moved && 'ring-1 ring-dynamic-cyan/70'
                  )}
                  key={`${block.day}-${block.top}`}
                  style={{ top: `${block.top}%`, height: `${block.height}%` }}
                >
                  {block.focus ? (
                    <span
                      className="absolute inset-0"
                      style={{
                        backgroundImage:
                          'repeating-linear-gradient(45deg, color-mix(in oklab, var(--foreground) 14%, transparent) 0 1px, transparent 1px 4px)',
                      }}
                    />
                  ) : null}
                </span>
              ))}
          </div>
        ))}

        {/* Now line, drawn across the whole week. */}
        <span className="pointer-events-none absolute inset-x-0 top-[52%] flex items-center">
          <span className="h-1 w-1 shrink-0 rounded-full bg-dynamic-red/80" />
          <span className="h-px flex-1 bg-dynamic-red/40" />
        </span>
      </div>

      <div className="mt-2 grid grid-cols-5 gap-1.5 text-center font-mono-ui text-[0.55rem] text-foreground/30">
        {dayLabels.map((label, index) => (
          <span
            className={cn(index === 3 && 'text-dynamic-blue/70')}
            key={`label-${label}-${index}`}
          >
            {label}
          </span>
        ))}
      </div>
    </PreviewFrame>
  );
}

/**
 * Tasks: a board mid-sprint. Priority pips, assignee chips and a done column
 * with struck-through rows so the state of the work is legible at thumbnail
 * size.
 */
export function TasksPreview() {
  const columns: Array<{
    count: string;
    tone: string;
    cards: Array<{ width: number; pip: string; done?: boolean }>;
  }> = [
    {
      count: '4',
      tone: 'bg-dynamic-orange/50',
      cards: [
        { width: 92, pip: 'bg-dynamic-red/70' },
        { width: 68, pip: 'bg-dynamic-orange/60' },
      ],
    },
    {
      count: '3',
      tone: 'bg-dynamic-blue/50',
      cards: [
        { width: 88, pip: 'bg-dynamic-blue/70' },
        { width: 74, pip: 'bg-dynamic-purple/60' },
        { width: 58, pip: 'bg-dynamic-blue/40' },
      ],
    },
    {
      count: '7',
      tone: 'bg-dynamic-green/50',
      cards: [{ width: 80, pip: 'bg-dynamic-green/70', done: true }],
    },
  ];

  return (
    <PreviewFrame>
      <div className="grid grid-cols-3 gap-1.5">
        {columns.map((column, columnIndex) => (
          <div
            className="rounded-md bg-foreground/[0.04] p-1.5"
            key={`column-${columnIndex}`}
          >
            <div className="mb-1.5 flex items-center justify-between gap-1">
              <span className={cn('h-1 w-5 rounded-full', column.tone)} />
              <span className="font-mono-ui text-[0.5rem] text-foreground/30 tabular-nums">
                {column.count}
              </span>
            </div>

            <div className="grid gap-1">
              {column.cards.map((card, cardIndex) => (
                <div
                  className={cn(
                    'rounded-[4px] border border-foreground/10 bg-background/70 p-1',
                    card.done && 'opacity-55'
                  )}
                  key={`card-${columnIndex}-${cardIndex}`}
                >
                  <div className="flex items-center gap-1">
                    <span
                      className={cn('h-1 w-1 shrink-0 rounded-full', card.pip)}
                    />
                    <span className="relative flex-1">
                      <Line width={card.width} />
                      {card.done ? (
                        <span className="absolute inset-x-0 top-1/2 h-px bg-foreground/25" />
                      ) : null}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-0.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-foreground/15" />
                    <span className="-ml-0.5 h-1.5 w-1.5 rounded-full bg-foreground/10" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </PreviewFrame>
  );
}

/**
 * Meet: an availability heatmap with the winning column bracketed. Density is
 * authored, not random, so the best slot genuinely is the darkest one.
 */
export function MeetPreview() {
  const density = [
    1, 2, 3, 4, 2, 1, 2, 3, 4, 4, 3, 2, 1, 2, 4, 4, 3, 1, 0, 1, 3, 4, 2, 1, 1,
    2, 2, 4, 2, 0,
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
      <PreviewHeader
        label="Overlap"
        value="8/9"
        valueClassName="text-dynamic-purple/80"
      />

      <div className="grid grid-cols-6 gap-1">
        {density.map((level, index) => (
          <span
            className={cn(
              'aspect-square rounded-[3px]',
              tones[level],
              // Column 3 is the winning slot — ring every cell in it.
              index % 6 === 3 && 'ring-1 ring-dynamic-purple/55'
            )}
            key={`cell-${index}`}
          />
        ))}
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-dynamic-purple" />
        <Line className="bg-dynamic-purple/30" width={44} />
      </div>
    </PreviewFrame>
  );
}

/**
 * Time tracking: where the week actually went, as a stacked day-by-day bar
 * with a live timer pill on top.
 */
export function TrackPreview() {
  const days = [
    [42, 24, 14],
    [30, 38, 10],
    [52, 16, 18],
    [26, 30, 26],
    [38, 20, 8],
  ];
  const segmentTones = [
    'bg-dynamic-orange/65',
    'bg-dynamic-purple/45',
    'bg-dynamic-blue/35',
  ];

  return (
    <PreviewFrame>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-mono-ui text-[0.6rem] text-foreground/35 uppercase tracking-[0.18em]">
          This week
        </span>
        <span className="flex items-center gap-1 rounded-full border border-dynamic-orange/30 bg-dynamic-orange/10 px-1.5 py-0.5">
          <span className="h-1 w-1 rounded-full bg-dynamic-orange" />
          <span className="font-mono-ui text-[0.55rem] text-dynamic-orange/90 tabular-nums">
            01:24
          </span>
        </span>
      </div>

      <div className="flex h-16 items-end gap-1.5 sm:h-[4.5rem]">
        {days.map((segments, dayIndex) => (
          <div
            className="flex flex-1 flex-col justify-end gap-[2px]"
            key={`day-${dayIndex}`}
          >
            {segments.map((height, segmentIndex) => (
              <span
                className={cn(
                  'w-full rounded-[2px]',
                  segmentTones[segmentIndex]
                )}
                key={`seg-${dayIndex}-${segmentIndex}`}
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-5 gap-1.5 text-center font-mono-ui text-[0.55rem] text-foreground/30">
        {dayLabels.map((label, index) => (
          <span key={`track-${label}-${index}`}>{label}</span>
        ))}
      </div>
    </PreviewFrame>
  );
}
