/**
 * Accent tokens for the satellite marketing kit.
 *
 * Tailwind cannot resolve a class name assembled at runtime, so every accent
 * variant has to exist as a literal string somewhere in the source. Keeping the
 * full set in one map means a new accent is added once and every marketing
 * primitive picks it up, instead of each component carrying its own partial
 * copy of the same lookup table.
 */

export type MarketingAccent =
  | 'blue'
  | 'cyan'
  | 'green'
  | 'indigo'
  | 'orange'
  | 'pink'
  | 'purple'
  | 'red'
  | 'yellow';

export interface MarketingAccentTokens {
  /** Foreground colour for icons and eyebrow labels. */
  text: string;
  /** Mid-stop for a hairline rule that fades out at both ends. */
  rule: string;
  /** Soft corner glow behind a hovered surface. */
  bloom: string;
  /** Filled chip / dot background. */
  solid: string;
  /** Tinted surface for badges and inline highlights. */
  soft: string;
  /** Border tint that pairs with `soft`. */
  border: string;
  /** Two-stop gradient for primary calls to action. */
  gradient: string;
  /** Radial bloom colour used by `SectionBloom`, referencing the raw token. */
  radial: string;
}

export const MARKETING_ACCENTS: Record<MarketingAccent, MarketingAccentTokens> =
  {
    blue: {
      text: 'text-dynamic-blue',
      rule: 'via-dynamic-blue/45',
      bloom: 'bg-dynamic-blue/20',
      solid: 'bg-dynamic-blue',
      soft: 'bg-dynamic-blue/10',
      border: 'border-dynamic-blue/25',
      gradient: 'from-dynamic-blue to-dynamic-cyan',
      radial: 'bg-[radial-gradient(closest-side,var(--blue),transparent)]',
    },
    cyan: {
      text: 'text-dynamic-cyan',
      rule: 'via-dynamic-cyan/45',
      bloom: 'bg-dynamic-cyan/20',
      solid: 'bg-dynamic-cyan',
      soft: 'bg-dynamic-cyan/10',
      border: 'border-dynamic-cyan/25',
      gradient: 'from-dynamic-cyan to-dynamic-blue',
      radial: 'bg-[radial-gradient(closest-side,var(--cyan),transparent)]',
    },
    green: {
      text: 'text-dynamic-green',
      rule: 'via-dynamic-green/45',
      bloom: 'bg-dynamic-green/20',
      solid: 'bg-dynamic-green',
      soft: 'bg-dynamic-green/10',
      border: 'border-dynamic-green/25',
      gradient: 'from-dynamic-green to-dynamic-cyan',
      radial: 'bg-[radial-gradient(closest-side,var(--green),transparent)]',
    },
    indigo: {
      text: 'text-dynamic-indigo',
      rule: 'via-dynamic-indigo/45',
      bloom: 'bg-dynamic-indigo/20',
      solid: 'bg-dynamic-indigo',
      soft: 'bg-dynamic-indigo/10',
      border: 'border-dynamic-indigo/25',
      gradient: 'from-dynamic-indigo to-dynamic-purple',
      radial: 'bg-[radial-gradient(closest-side,var(--indigo),transparent)]',
    },
    orange: {
      text: 'text-dynamic-orange',
      rule: 'via-dynamic-orange/45',
      bloom: 'bg-dynamic-orange/20',
      solid: 'bg-dynamic-orange',
      soft: 'bg-dynamic-orange/10',
      border: 'border-dynamic-orange/25',
      gradient: 'from-dynamic-orange to-dynamic-pink',
      radial: 'bg-[radial-gradient(closest-side,var(--orange),transparent)]',
    },
    pink: {
      text: 'text-dynamic-pink',
      rule: 'via-dynamic-pink/45',
      bloom: 'bg-dynamic-pink/20',
      solid: 'bg-dynamic-pink',
      soft: 'bg-dynamic-pink/10',
      border: 'border-dynamic-pink/25',
      gradient: 'from-dynamic-pink to-dynamic-purple',
      radial: 'bg-[radial-gradient(closest-side,var(--pink),transparent)]',
    },
    purple: {
      text: 'text-dynamic-purple',
      rule: 'via-dynamic-purple/45',
      bloom: 'bg-dynamic-purple/20',
      solid: 'bg-dynamic-purple',
      soft: 'bg-dynamic-purple/10',
      border: 'border-dynamic-purple/25',
      gradient: 'from-dynamic-purple to-dynamic-blue',
      radial: 'bg-[radial-gradient(closest-side,var(--purple),transparent)]',
    },
    red: {
      text: 'text-dynamic-red',
      rule: 'via-dynamic-red/45',
      bloom: 'bg-dynamic-red/20',
      solid: 'bg-dynamic-red',
      soft: 'bg-dynamic-red/10',
      border: 'border-dynamic-red/25',
      gradient: 'from-dynamic-red to-dynamic-orange',
      radial: 'bg-[radial-gradient(closest-side,var(--red),transparent)]',
    },
    yellow: {
      text: 'text-dynamic-yellow',
      rule: 'via-dynamic-yellow/45',
      bloom: 'bg-dynamic-yellow/20',
      solid: 'bg-dynamic-yellow',
      soft: 'bg-dynamic-yellow/10',
      border: 'border-dynamic-yellow/25',
      gradient: 'from-dynamic-yellow to-dynamic-orange',
      radial: 'bg-[radial-gradient(closest-side,var(--yellow),transparent)]',
    },
  };

export function getMarketingAccent(
  accent: MarketingAccent
): MarketingAccentTokens {
  return MARKETING_ACCENTS[accent];
}
