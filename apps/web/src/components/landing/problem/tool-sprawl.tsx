import { ArrowRight } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';

/**
 * The problem, drawn.
 *
 * Left: the tools you already juggle, scattered and unconnected. Right: the
 * same work gathered into one surface. Deliberately abstract — unlabelled
 * tiles, no competitor marks — so it illustrates the shape of the problem
 * without naming or misrepresenting anyone's product.
 */

/** Fixed positions so the scatter is composed rather than random. */
const scattered = [
  { x: 6, y: 10, size: 26, tone: 'bg-foreground/[0.09]' },
  { x: 34, y: 4, size: 20, tone: 'bg-foreground/[0.07]' },
  { x: 62, y: 14, size: 30, tone: 'bg-foreground/[0.08]' },
  { x: 12, y: 44, size: 22, tone: 'bg-foreground/[0.06]' },
  { x: 44, y: 38, size: 28, tone: 'bg-foreground/[0.09]' },
  { x: 74, y: 48, size: 18, tone: 'bg-foreground/[0.06]' },
  { x: 22, y: 72, size: 24, tone: 'bg-foreground/[0.08]' },
  { x: 54, y: 70, size: 20, tone: 'bg-foreground/[0.07]' },
  { x: 80, y: 78, size: 26, tone: 'bg-foreground/[0.06]' },
];

/** The gathered grid: brand accents, aligned, evenly spaced. */
const gathered = [
  'bg-dynamic-blue/50',
  'bg-dynamic-green/50',
  'bg-dynamic-purple/50',
  'bg-dynamic-cyan/50',
  'bg-dynamic-orange/50',
  'bg-dynamic-pink/50',
  'bg-dynamic-yellow/50',
  'bg-dynamic-red/50',
  'bg-dynamic-teal/50',
];

export function ToolSprawl() {
  return (
    <div
      aria-hidden
      className="mb-10 grid items-center gap-3 sm:mb-16 sm:grid-cols-[1fr_auto_1fr] sm:gap-4"
    >
      {/* Before: scatter */}
      <div className="group relative h-36 overflow-hidden rounded-2xl border border-dynamic-red/15 bg-dynamic-red/[0.02] sm:h-48">
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'linear-gradient(to right, color-mix(in oklab, var(--foreground) 5%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--foreground) 5%, transparent) 1px, transparent 1px)',
            backgroundSize: '22px 22px',
          }}
        />
        {scattered.map((tile, index) => (
          <span
            className={cn(
              'absolute rounded-md transition-transform duration-500 group-hover:-translate-y-0.5',
              index % 3 === 0 && 'opacity-80',
              tile.tone
            )}
            key={`${tile.x}-${tile.y}`}
            style={{
              left: `${tile.x}%`,
              top: `${tile.y}%`,
              width: tile.size,
              height: tile.size,
            }}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />
      </div>

      {/* Transition */}
      <div className="flex justify-center py-2 sm:py-0">
        <span className="flex h-9 w-9 items-center justify-center rounded-full border border-foreground/10 bg-background/60 backdrop-blur-sm">
          <ArrowRight className="h-4 w-4 rotate-90 text-foreground/40 sm:rotate-0" />
        </span>
      </div>

      {/* After: one surface */}
      <div className="group relative h-36 overflow-hidden rounded-2xl border border-dynamic-green/20 bg-foreground/[0.015] sm:h-48">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-dynamic-green/50 to-transparent"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="grid grid-cols-3 gap-2.5">
            {gathered.map((tone, index) => (
              <span
                className={cn(
                  'h-8 w-8 rounded-md shadow-foreground/5 shadow-sm transition-transform duration-500 group-hover:scale-[1.03] sm:h-9 sm:w-9',
                  index === 4 && 'ring-1 ring-foreground/15',
                  tone
                )}
                key={tone}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
