import { cn } from '@tuturuuu/utils/format';
import { Line, PreviewFrame, PreviewHeader } from './frame';

/** Previews for the apps that run the business: finance, CRM, inventory, Nova. */

/**
 * Finance: monthly net as bars, with the trend drawn over the top and the
 * current month lit. The polyline is what turns eight bars into a story.
 */
export function FinancePreview() {
  const bars = [38, 52, 44, 68, 58, 76, 64, 88];
  // Trend points in the same 0-100 space as the bars, flipped for SVG's origin.
  const trend = bars
    .map((value, index) => {
      const x = (index / (bars.length - 1)) * 100;
      const y = 100 - value;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <PreviewFrame>
      <PreviewHeader
        label="Net"
        value="+18.4%"
        valueClassName="text-dynamic-pink/80"
      />

      <div className="relative h-16 sm:h-20">
        <div className="flex h-full items-end gap-1.5">
          {bars.map((height, index) => (
            <span
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

        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          fill="none"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <title>Net trend</title>
          <polyline
            points={trend}
            stroke="color-mix(in oklab, var(--pink) 75%, transparent)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      {/* Category split */}
      <div className="mt-2 flex h-1 overflow-hidden rounded-full">
        <span className="w-[46%] bg-dynamic-pink/60" />
        <span className="w-[28%] bg-dynamic-purple/45" />
        <span className="w-[16%] bg-dynamic-blue/35" />
        <span className="flex-1 bg-foreground/10" />
      </div>
    </PreviewFrame>
  );
}

/**
 * CRM: the pipeline as a funnel. Each stage narrows, carries its own deal
 * count, and the stage under review is ringed.
 */
export function CrmPreview() {
  const stages = [
    { width: 100, count: '24', tone: 'bg-dynamic-blue/45' },
    { width: 76, count: '16', tone: 'bg-dynamic-blue/35' },
    { width: 52, count: '9', tone: 'bg-dynamic-blue/28', active: true },
    { width: 30, count: '4', tone: 'bg-dynamic-green/45' },
  ];

  return (
    <PreviewFrame>
      <PreviewHeader
        label="Pipeline"
        value="$182k"
        valueClassName="text-dynamic-blue/80"
      />

      <div className="grid gap-1.5">
        {stages.map((stage, index) => (
          <div className="flex items-center gap-2" key={`stage-${index}`}>
            <span
              className={cn(
                'flex h-4 items-center rounded-[3px] px-1.5',
                stage.tone,
                stage.active && 'ring-1 ring-dynamic-blue/70'
              )}
              style={{ width: `${stage.width}%` }}
            >
              <Line className="bg-background/40" width={40} />
            </span>
            <span className="shrink-0 font-mono-ui text-[0.55rem] text-foreground/30 tabular-nums">
              {stage.count}
            </span>
          </div>
        ))}
      </div>
    </PreviewFrame>
  );
}

/**
 * Inventory: stock levels per product, with one line already under its
 * reorder point — the case the app exists to catch.
 */
export function InventoryPreview() {
  const items = [
    { level: 82, tone: 'bg-dynamic-green/60', low: false },
    { level: 64, tone: 'bg-dynamic-green/45', low: false },
    { level: 14, tone: 'bg-dynamic-red/65', low: true },
    { level: 47, tone: 'bg-dynamic-green/35', low: false },
  ];

  return (
    <PreviewFrame>
      <PreviewHeader
        label="Stock"
        value="1 low"
        valueClassName="text-dynamic-red/80"
      />

      <div className="grid gap-1.5">
        {items.map((item, index) => (
          <div className="flex items-center gap-2" key={`item-${index}`}>
            <span
              className={cn(
                'h-3 w-2.5 shrink-0 rounded-[2px]',
                item.low ? 'bg-dynamic-red/25' : 'bg-foreground/10'
              )}
            />
            <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
              <span
                className={cn(
                  'absolute inset-y-0 left-0 rounded-full',
                  item.tone
                )}
                style={{ width: `${item.level}%` }}
              />
              {/* Reorder threshold */}
              <span className="absolute inset-y-0 left-[22%] w-px bg-foreground/25" />
            </span>
            <span
              className={cn(
                'w-5 shrink-0 text-right font-mono-ui text-[0.55rem] tabular-nums',
                item.low ? 'text-dynamic-red/80' : 'text-foreground/30'
              )}
            >
              {item.level}
            </span>
          </div>
        ))}
      </div>
    </PreviewFrame>
  );
}

/**
 * Nova: the leaderboard, with the reader's own rank lit and their XP ring
 * sitting beside it.
 */
export function NovaPreview() {
  const rows = [
    { width: 92, tone: 'bg-dynamic-orange/70', you: false },
    { width: 74, tone: 'bg-dynamic-orange/50', you: true },
    { width: 51, tone: 'bg-dynamic-orange/30', you: false },
  ];

  return (
    <PreviewFrame>
      <PreviewHeader
        label="Rank"
        value="2,480 XP"
        valueClassName="text-dynamic-orange/80"
      />

      <div className="flex items-center gap-2.5">
        <div className="grid flex-1 gap-2">
          {rows.map((row, index) => (
            <div className="flex items-center gap-2" key={`row-${index}`}>
              <span
                className={cn(
                  'w-3 font-mono-ui text-[0.55rem] tabular-nums',
                  row.you ? 'text-dynamic-orange/90' : 'text-foreground/30'
                )}
              >
                {index + 1}
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.06]">
                <span
                  className={cn(
                    'block h-full rounded-full',
                    row.tone,
                    row.you && 'ring-1 ring-dynamic-orange/50'
                  )}
                  style={{ width: `${row.width}%` }}
                />
              </span>
            </div>
          ))}
        </div>

        {/* Level ring */}
        <div className="relative h-11 w-11 shrink-0">
          <span
            className="absolute inset-0 rounded-full"
            style={{
              background:
                'conic-gradient(color-mix(in oklab, var(--orange) 75%, transparent) 0turn 0.74turn, color-mix(in oklab, var(--foreground) 8%, transparent) 0.74turn 1turn)',
            }}
          />
          <span className="absolute inset-[3px] flex items-center justify-center rounded-full bg-background">
            <span className="font-mono-ui text-[0.55rem] text-dynamic-orange/80 tabular-nums">
              7
            </span>
          </span>
        </div>
      </div>
    </PreviewFrame>
  );
}
