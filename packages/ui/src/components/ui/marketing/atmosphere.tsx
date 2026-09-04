import { cn } from '@tuturuuu/utils/format';
import { getMarketingAccent, type MarketingAccent } from './accents';

/**
 * Grain overlay.
 *
 * A single inlined SVG turbulence tile — no network request, no image asset.
 * Keeps large flat areas from banding and gives surfaces a filmic tooth.
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
 * Fine engineering grid, masked to fade at the edges so it reads as a substrate
 * rather than graph paper.
 */
export function GridSubstrate({
  className,
  size = '64px',
}: {
  className?: string;
  size?: string;
}) {
  const mask =
    'radial-gradient(ellipse 80% 60% at 50% 40%, black 20%, transparent 75%)';

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
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    />
  );
}

interface HeroAtmosphereProps {
  /** Bloom behind the headline. */
  primary?: MarketingAccent;
  /** Cool counterweight in the upper right. */
  secondary?: MarketingAccent;
  /** Accent under the product frame. */
  tertiary?: MarketingAccent;
  /** Fades the rig into the page background at the bottom edge. */
  settle?: boolean;
  className?: string;
}

/**
 * The hero light rig: three placed blooms rather than a full-bleed animated
 * wash, which smears muddy brown across the viewport in dark mode. Each bloom
 * drifts slowly and independently; all motion stops under
 * `prefers-reduced-motion`.
 */
export function HeroAtmosphere({
  primary = 'purple',
  secondary = 'blue',
  tertiary = 'cyan',
  settle = true,
  className,
}: HeroAtmosphereProps = {}) {
  const bloom = (accent: MarketingAccent, strength: number) =>
    `radial-gradient(closest-side,color-mix(in oklab,var(--${accent}) ${strength}%,transparent),transparent)`;

  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 -z-10', className)}
    >
      {/* Primary bloom — sits behind the headline */}
      <div
        className="absolute -top-32 left-1/2 h-[30rem] w-[34rem] -translate-x-1/2 rounded-full opacity-45 blur-2xl motion-reduce:animate-none sm:-top-40 sm:h-[42rem] sm:w-[52rem] sm:animate-bloom-drift sm:opacity-50 sm:blur-3xl dark:opacity-55 dark:sm:opacity-60"
        style={{ backgroundImage: bloom(primary, 34) }}
      />

      {/* Cool counterweight — upper right */}
      <div
        className="absolute -top-20 right-[8%] hidden h-[30rem] w-[34rem] animate-bloom-drift-slow rounded-full opacity-45 blur-3xl motion-reduce:animate-none sm:block dark:opacity-55"
        style={{ backgroundImage: bloom(secondary, 34) }}
      />

      {/* Warm-cool accent — under the product frame */}
      <div
        className="absolute top-[38%] left-[6%] hidden h-[26rem] w-[30rem] animate-bloom-drift rounded-full opacity-40 blur-3xl [animation-delay:-8s] motion-reduce:animate-none sm:block dark:opacity-50"
        style={{ backgroundImage: bloom(tertiary, 28) }}
      />

      {/* Light seam across the top — the horizon of the rig */}
      <div
        className="absolute inset-x-0 top-0 h-px motion-reduce:animate-none sm:animate-sheen"
        style={{
          backgroundImage: `linear-gradient(90deg,transparent,color-mix(in oklab,var(--${primary}) 55%,transparent) 35%,color-mix(in oklab,var(--${tertiary}) 55%,transparent) 65%,transparent)`,
        }}
      />

      <GridSubstrate />

      {settle ? (
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-b from-transparent to-background" />
      ) : null}

      <Grain />
    </div>
  );
}

/**
 * Quieter bloom for sections below the fold — keeps colour continuity down the
 * page without competing with the hero.
 */
export function SectionBloom({
  tone = 'purple',
  align = 'center',
}: {
  tone?: MarketingAccent;
  align?: 'center' | 'left' | 'right';
}) {
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
        getMarketingAccent(tone).radial,
        positions[align]
      )}
    />
  );
}
