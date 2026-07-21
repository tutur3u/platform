import { cn } from '@tuturuuu/utils/format';

/**
 * Grain overlay.
 *
 * A single inlined SVG turbulence tile — no network request, no image asset.
 * Keeps large flat dark areas from banding and gives surfaces a filmic tooth.
 */
export function Grain({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 opacity-[0.035] mix-blend-overlay dark:opacity-[0.055]',
        className
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
      }}
    />
  );
}

/**
 * Fine engineering grid, masked to fade at the edges so it reads as a
 * substrate rather than graph paper.
 */
export function GridSubstrate({
  className,
  size = '64px',
}: {
  className?: string;
  size?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 opacity-[0.5] dark:opacity-[0.35]',
        className
      )}
      style={{
        backgroundImage:
          'linear-gradient(to right, color-mix(in oklab, var(--foreground) 6%, transparent) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in oklab, var(--foreground) 6%, transparent) 1px, transparent 1px)',
        backgroundSize: `${size} ${size}`,
        maskImage:
          'radial-gradient(ellipse 80% 60% at 50% 40%, black 20%, transparent 75%)',
        WebkitMaskImage:
          'radial-gradient(ellipse 80% 60% at 50% 40%, black 20%, transparent 75%)',
      }}
    />
  );
}

/**
 * The hero light rig.
 *
 * Three placed blooms instead of a full-bleed animated gradient wash: the
 * previous aurora smeared muddy brown across the whole viewport in dark mode.
 * Each bloom drifts slowly and independently, and all motion is disabled under
 * `prefers-reduced-motion`.
 */
export function HeroAtmosphere() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      {/* Primary bloom — sits behind the headline */}
      <div className="absolute -top-40 left-1/2 h-[42rem] w-[52rem] -translate-x-1/2 animate-bloom-drift rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--purple)_38%,transparent),transparent)] opacity-50 blur-3xl motion-reduce:animate-none dark:opacity-60" />

      {/* Cool counterweight — upper right */}
      <div className="absolute -top-20 right-[8%] h-[30rem] w-[34rem] animate-bloom-drift-slow rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--blue)_34%,transparent),transparent)] opacity-45 blur-3xl motion-reduce:animate-none dark:opacity-55" />

      {/* Warm-cool accent — under the product frame */}
      <div className="absolute top-[38%] left-[6%] h-[26rem] w-[30rem] animate-bloom-drift rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--cyan)_28%,transparent),transparent)] opacity-40 blur-3xl [animation-delay:-8s] motion-reduce:animate-none dark:opacity-50" />

      {/* Light seam across the top — the horizon of the rig */}
      <div className="absolute inset-x-0 top-0 h-px animate-sheen bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--purple)_55%,transparent)_35%,color-mix(in_oklab,var(--cyan)_55%,transparent)_65%,transparent)] motion-reduce:animate-none" />

      <GridSubstrate />

      {/* Settle everything into the page background at the bottom edge */}
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-b from-transparent to-background" />

      <Grain />
    </div>
  );
}

/**
 * Quieter bloom for sections below the fold — keeps color continuity down the
 * page without competing with the hero.
 */
export type BloomTone = 'purple' | 'blue' | 'cyan' | 'green' | 'red' | 'orange';

export function SectionBloom({
  tone = 'purple',
  align = 'center',
}: {
  tone?: BloomTone;
  align?: 'center' | 'left' | 'right';
}) {
  const tones = {
    purple: 'bg-[radial-gradient(closest-side,var(--purple),transparent)]',
    blue: 'bg-[radial-gradient(closest-side,var(--blue),transparent)]',
    cyan: 'bg-[radial-gradient(closest-side,var(--cyan),transparent)]',
    green: 'bg-[radial-gradient(closest-side,var(--green),transparent)]',
    red: 'bg-[radial-gradient(closest-side,var(--red),transparent)]',
    orange: 'bg-[radial-gradient(closest-side,var(--orange),transparent)]',
  } as const;

  const positions = {
    center: 'left-1/2 -translate-x-1/2',
    left: 'left-[-10%]',
    right: 'right-[-10%]',
  } as const;

  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute top-0 -z-10 h-[28rem] w-[40rem] rounded-full opacity-[0.07] blur-3xl dark:opacity-[0.12]',
        tones[tone],
        positions[align]
      )}
    />
  );
}
