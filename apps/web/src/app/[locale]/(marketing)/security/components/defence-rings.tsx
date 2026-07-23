import { Lock } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';

/**
 * Defence in depth, drawn.
 *
 * Four nested boundaries around the thing being protected, each labelled with
 * the control that guards it. The point is the nesting: nothing on this page
 * is a single wall, so a single wall would be the wrong picture.
 */
const layers = [
  {
    label: 'Infrastructure',
    detail: 'Isolated, redundant',
    ring: 'border-dynamic-blue/25',
    glow: 'bg-dynamic-blue/[0.04]',
    text: 'text-dynamic-blue/70',
  },
  {
    label: 'Transport',
    detail: 'Encrypted in transit',
    ring: 'border-dynamic-cyan/30',
    glow: 'bg-dynamic-cyan/[0.05]',
    text: 'text-dynamic-cyan/70',
  },
  {
    label: 'Access',
    detail: 'RBAC and MFA',
    ring: 'border-dynamic-purple/35',
    glow: 'bg-dynamic-purple/[0.06]',
    text: 'text-dynamic-purple/70',
  },
  {
    label: 'Storage',
    detail: 'Encrypted at rest',
    ring: 'border-dynamic-green/40',
    glow: 'bg-dynamic-green/[0.07]',
    text: 'text-dynamic-green/75',
  },
];

export function DefenceRings() {
  return (
    <div
      aria-hidden
      className="relative mx-auto grid w-full max-w-3xl gap-6 px-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
    >
      {/* The nest */}
      <div className="relative mx-auto aspect-square w-full max-w-[19rem]">
        {layers.map((layer, index) => {
          const inset = index * 11;

          return (
            <div
              className={cn(
                'absolute rounded-2xl border',
                layer.ring,
                layer.glow
              )}
              key={layer.label}
              style={{
                inset: `${inset}%`,
              }}
            >
              <span
                className={cn(
                  'absolute top-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap bg-background px-1.5 font-mono-ui text-[0.5rem] uppercase tracking-[0.18em]',
                  layer.text
                )}
              >
                {layer.label}
              </span>
            </div>
          );
        })}

        {/* What all of it is for */}
        <div className="absolute inset-[44%] flex items-center justify-center rounded-xl border border-foreground/15 bg-background">
          <Lock className="h-4 w-4 text-foreground/60" />
        </div>
        <span className="absolute inset-x-0 bottom-[30%] text-center font-mono-ui text-[0.5rem] text-foreground/40 uppercase tracking-[0.18em]">
          Your data
        </span>
      </div>

      {/* The legend, so the rings are readable rather than merely decorative */}
      <dl className="grid gap-3 text-left sm:w-52">
        {[...layers].reverse().map((layer) => (
          <div
            className="flex items-start gap-2.5"
            key={`legend-${layer.label}`}
          >
            <span
              className={cn(
                'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full border',
                layer.ring
              )}
            />
            <div className="min-w-0">
              <dt
                className={cn(
                  'font-mono-ui text-[0.58rem] uppercase tracking-[0.16em]',
                  layer.text
                )}
              >
                {layer.label}
              </dt>
              <dd className="mt-0.5 text-foreground/45 text-xs">
                {layer.detail}
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}
