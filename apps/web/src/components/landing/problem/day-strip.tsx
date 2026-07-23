import { cn } from '@tuturuuu/utils/format';

/**
 * The same working day, drawn twice.
 *
 * Top: attention shredded across a dozen tools — every sliver is one switch,
 * every gap is the re-orientation tax you pay to make it. Bottom: the same
 * hours, gathered. The argument is made by the shape of the two rows, so it
 * lands before a single word of copy is read.
 *
 * Everything here is authored rather than random: the fragment list *is* the
 * switch count quoted in the caption, so the picture and the number can never
 * drift apart.
 */

/** Muted app tones — enough variety to read as "different tools", never bright. */
const fragmentTones = [
  'bg-dynamic-blue/25',
  'bg-dynamic-purple/25',
  'bg-foreground/12',
  'bg-dynamic-orange/25',
  'bg-dynamic-cyan/20',
  'bg-foreground/10',
  'bg-dynamic-pink/20',
  'bg-dynamic-green/20',
];

/**
 * Relative widths of each sliver. Small and uneven on purpose — nothing here
 * lasts long enough to become real work.
 */
const fragments = [
  4, 2, 3, 5, 2, 2, 4, 3, 2, 6, 2, 3, 2, 4, 2, 5, 3, 2, 2, 4, 3, 5, 2, 3, 2, 2,
  4, 3, 6, 2, 3, 2, 4, 2, 3, 5, 2, 3,
];

/** The consolidated day: a handful of blocks long enough to finish something. */
const blocks = [
  { grow: 26, tone: 'bg-dynamic-blue/45', label: true },
  { grow: 12, tone: 'bg-dynamic-green/40', label: false },
  { grow: 30, tone: 'bg-dynamic-purple/45', label: true },
  { grow: 14, tone: 'bg-dynamic-cyan/35', label: false },
  { grow: 22, tone: 'bg-dynamic-blue/35', label: true },
];

const hourTicks = ['9', '10', '11', '12', '1', '2', '3', '4', '5'];

function RowHeading({
  label,
  meta,
  tone,
}: {
  label: string;
  meta: string;
  tone: 'muted' | 'accent';
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <span className="flex items-center gap-2 font-mono-ui text-[0.62rem] uppercase tracking-[0.2em]">
        <span
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            tone === 'accent' ? 'bg-dynamic-green' : 'bg-dynamic-red/70'
          )}
        />
        <span
          className={cn(
            tone === 'accent' ? 'text-dynamic-green/80' : 'text-foreground/45'
          )}
        >
          {label}
        </span>
      </span>
      <span
        className={cn(
          'font-mono-ui text-[0.62rem] tabular-nums',
          tone === 'accent' ? 'text-dynamic-green/70' : 'text-dynamic-red/70'
        )}
      >
        {meta}
      </span>
    </div>
  );
}

/**
 * Exported so the caption can be built from the same numbers the drawing uses:
 * the copy can never claim a switch count the strip does not actually show.
 */
export const FRAGMENT_COUNT = fragments.length;
export const BLOCK_COUNT = blocks.length;

interface DayStripProps {
  fragmentedLabel: string;
  fragmentedMeta: string;
  consolidatedLabel: string;
  consolidatedMeta: string;
}

export function DayStrip({
  fragmentedLabel,
  fragmentedMeta,
  consolidatedLabel,
  consolidatedMeta,
}: DayStripProps) {
  return (
    <div className="relative mb-12 overflow-hidden rounded-3xl border border-foreground/10 bg-gradient-to-b from-foreground/[0.045] to-transparent p-5 sm:mb-16 sm:p-7">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent"
      />

      {/* The fragmented day */}
      <RowHeading label={fragmentedLabel} meta={fragmentedMeta} tone="muted" />
      <div
        aria-hidden
        className="relative flex h-11 gap-[3px] overflow-hidden rounded-lg bg-foreground/[0.03] p-1 sm:h-14"
      >
        {fragments.map((grow, index) => (
          <span
            className={cn(
              'rounded-[2px]',
              fragmentTones[index % fragmentTones.length],
              // A few slivers never even got started.
              index % 11 === 5 && 'opacity-30'
            )}
            key={`fragment-${index}`}
            style={{ flexGrow: grow, flexBasis: 0 }}
          />
        ))}
        {/* Restless light travelling across the shredded row. */}
        <span
          className="pointer-events-none absolute inset-0 animate-day-scan"
          style={{
            backgroundImage:
              'linear-gradient(90deg, transparent, color-mix(in oklab, var(--red) 18%, transparent), transparent)',
            backgroundRepeat: 'no-repeat',
            backgroundSize: '55% 100%',
          }}
        />
      </div>

      {/* Hour ruler, shared by both rows so they are visibly the same day. */}
      <div
        aria-hidden
        className="my-3 flex items-center justify-between border-foreground/[0.07] border-y py-1.5"
      >
        {hourTicks.map((hour, index) => (
          <span
            className="flex flex-col items-center gap-1"
            key={`tick-${hour}-${index}`}
          >
            <span className="h-1 w-px bg-foreground/15" />
            <span className="font-mono-ui text-[0.5rem] text-foreground/25 tabular-nums">
              {hour}
            </span>
          </span>
        ))}
      </div>

      {/* The gathered day */}
      <RowHeading
        label={consolidatedLabel}
        meta={consolidatedMeta}
        tone="accent"
      />
      <div
        aria-hidden
        className="flex h-11 gap-[3px] overflow-hidden rounded-lg bg-foreground/[0.03] p-1 sm:h-14"
      >
        {blocks.map((block, index) => (
          <span
            className={cn(
              'relative flex items-center overflow-hidden rounded-[3px] px-2',
              block.tone
            )}
            key={`block-${index}`}
            style={{ flexGrow: block.grow, flexBasis: 0 }}
          >
            {block.label ? (
              <span className="h-1 w-full max-w-[3.5rem] rounded-full bg-background/40" />
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}
