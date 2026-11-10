'use client';

import { cn } from '@tuturuuu/utils/format';

/**
 * Type specimens.
 *
 * The old section printed the full sample sentence four times per face, once
 * per weight, each at `text-2xl` — eight near-identical paragraphs that made
 * the weights harder to compare, not easier. A specimen wants one large
 * setting to judge the face by, the character set it covers, and a tight ramp
 * where the only variable between rows is weight.
 */

export interface TypeFace {
  className: string;
  name: string;
  /** Sample sentence, in the script this face is here to serve. */
  sample: string;
  usage: string;
  weights: string[];
}

export function TypeSpecimen({
  face,
  weightsLabel,
}: {
  face: TypeFace;
  weightsLabel: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] transition-colors duration-500 hover:border-foreground/15">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent"
      />

      {/* The face, large enough to actually judge */}
      <div className="relative grid min-h-64 place-items-center overflow-hidden border-foreground/[0.07] border-b px-8 py-12">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              'linear-gradient(to bottom, transparent 0, transparent calc(100% - 1px), color-mix(in oklab, var(--foreground) 8%, transparent) 100%)',
            backgroundSize: '100% 2.5rem',
            maskImage:
              'radial-gradient(ellipse 70% 70% at 50% 50%, black 20%, transparent 80%)',
            WebkitMaskImage:
              'radial-gradient(ellipse 70% 70% at 50% 50%, black 20%, transparent 80%)',
          }}
        />
        <p
          className={cn(
            'relative text-center text-8xl leading-none tracking-[-0.04em]',
            face.className
          )}
        >
          Aa
        </p>
      </div>

      <div className="p-6 sm:p-7">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className={cn('font-semibold text-2xl', face.className)}>
            {face.name}
          </h3>
          <span className="font-mono-ui text-[0.58rem] text-foreground/35 uppercase tracking-[0.16em]">
            {face.weights.length} {weightsLabel}
          </span>
        </div>

        <p className="mt-3 text-foreground/55 leading-relaxed">{face.usage}</p>

        {/* Sample, set once at reading size */}
        <p
          className={cn(
            'mt-6 text-pretty text-foreground/80 text-xl leading-relaxed',
            face.className
          )}
        >
          {face.sample}
        </p>

        {/* Weight ramp: one short string, four weights, nothing else moving */}
        <dl className="mt-7 divide-y divide-foreground/[0.07] border-foreground/[0.07] border-t">
          {face.weights.map((weight) => {
            const [value, label] = weight.split(' ');

            return (
              <div
                className="flex items-baseline justify-between gap-6 py-3"
                key={`${face.name}-${weight}`}
              >
                <dd
                  className={cn('min-w-0 truncate text-lg', face.className)}
                  style={{ fontWeight: Number(value) }}
                >
                  {face.name}
                </dd>
                <dt className="shrink-0 font-mono-ui text-[0.6rem] text-foreground/35 uppercase tabular-nums tracking-[0.14em]">
                  {value} {label}
                </dt>
              </div>
            );
          })}
        </dl>
      </div>
    </div>
  );
}
