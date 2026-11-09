/**
 * Static per-tier colour lookups for the pricing surface.
 *
 * Every class string here is written out in full on purpose: Tailwind scans
 * source text, so a name assembled at runtime (`bg-dynamic-${color}/10`) never
 * makes it into the stylesheet. Add a colour by adding a whole row.
 */
export type PricingColor =
  | 'green'
  | 'blue'
  | 'purple'
  | 'orange'
  | 'cyan'
  | 'gray';

export interface PricingColorStyle {
  /** Border for the highlighted tier. */
  border: string;
  /** Border the card picks up on hover when it is not highlighted. */
  hoverBorder: string;
  /** Lit top edge hairline. */
  rule: string;
  /** Corner bloom revealed on hover. */
  bloom: string;
  /** Slow drifting aura behind the highlighted card's header. */
  aura: string;
  /** Halo cast behind the highlighted card. */
  halo: string;
  /** Tier icon glyph + its surface. */
  icon: string;
  iconSurface: string;
  /** Mono badge in the card's top-right corner. */
  badge: string;
  /** Feature list check glyph + its surface. */
  check: string;
  checkSurface: string;
  /** "Everything in X" inheritance row. */
  inheritRow: string;
  /** Filled CTA for the highlighted tier. */
  cta: string;
  /** Column accent in the comparison matrix. */
  column: string;
}

export const pricingColorStyles: Record<PricingColor, PricingColorStyle> = {
  green: {
    border: 'border-dynamic-green/35',
    hoverBorder: 'hover:border-dynamic-green/30',
    rule: 'via-dynamic-green/50',
    bloom: 'bg-dynamic-green/25',
    aura: 'bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--green)_45%,transparent),transparent)]',
    halo: 'bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklab,var(--green)_50%,transparent),transparent_72%)]',
    icon: 'text-dynamic-green',
    iconSurface: 'border-dynamic-green/25 bg-dynamic-green/10',
    badge: 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
    check: 'text-dynamic-green',
    checkSurface: 'border-dynamic-green/25 bg-dynamic-green/10',
    inheritRow: 'border-dynamic-green/20 bg-dynamic-green/[0.07]',
    cta: 'bg-dynamic-green text-background hover:bg-dynamic-green/90',
    column: 'text-dynamic-green',
  },
  blue: {
    border: 'border-dynamic-blue/35',
    hoverBorder: 'hover:border-dynamic-blue/30',
    rule: 'via-dynamic-blue/50',
    bloom: 'bg-dynamic-blue/25',
    aura: 'bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--blue)_45%,transparent),transparent)]',
    halo: 'bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklab,var(--blue)_50%,transparent),transparent_72%)]',
    icon: 'text-dynamic-blue',
    iconSurface: 'border-dynamic-blue/25 bg-dynamic-blue/10',
    badge: 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue',
    check: 'text-dynamic-blue',
    checkSurface: 'border-dynamic-blue/25 bg-dynamic-blue/10',
    inheritRow: 'border-dynamic-blue/20 bg-dynamic-blue/[0.07]',
    cta: 'bg-dynamic-blue text-background hover:bg-dynamic-blue/90',
    column: 'text-dynamic-blue',
  },
  purple: {
    border: 'border-dynamic-purple/35',
    hoverBorder: 'hover:border-dynamic-purple/30',
    rule: 'via-dynamic-purple/50',
    bloom: 'bg-dynamic-purple/25',
    aura: 'bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--purple)_45%,transparent),transparent)]',
    halo: 'bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklab,var(--purple)_50%,transparent),transparent_72%)]',
    icon: 'text-dynamic-purple',
    iconSurface: 'border-dynamic-purple/25 bg-dynamic-purple/10',
    badge: 'border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple',
    check: 'text-dynamic-purple',
    checkSurface: 'border-dynamic-purple/25 bg-dynamic-purple/10',
    inheritRow: 'border-dynamic-purple/20 bg-dynamic-purple/[0.07]',
    cta: 'bg-dynamic-purple text-background hover:bg-dynamic-purple/90',
    column: 'text-dynamic-purple',
  },
  orange: {
    border: 'border-dynamic-orange/35',
    hoverBorder: 'hover:border-dynamic-orange/30',
    rule: 'via-dynamic-orange/50',
    bloom: 'bg-dynamic-orange/25',
    aura: 'bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--orange)_45%,transparent),transparent)]',
    halo: 'bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklab,var(--orange)_50%,transparent),transparent_72%)]',
    icon: 'text-dynamic-orange',
    iconSurface: 'border-dynamic-orange/25 bg-dynamic-orange/10',
    badge: 'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange',
    check: 'text-dynamic-orange',
    checkSurface: 'border-dynamic-orange/25 bg-dynamic-orange/10',
    inheritRow: 'border-dynamic-orange/20 bg-dynamic-orange/[0.07]',
    cta: 'bg-dynamic-orange text-background hover:bg-dynamic-orange/90',
    column: 'text-dynamic-orange',
  },
  cyan: {
    border: 'border-dynamic-cyan/35',
    hoverBorder: 'hover:border-dynamic-cyan/30',
    rule: 'via-dynamic-cyan/50',
    bloom: 'bg-dynamic-cyan/25',
    aura: 'bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--cyan)_45%,transparent),transparent)]',
    halo: 'bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklab,var(--cyan)_50%,transparent),transparent_72%)]',
    icon: 'text-dynamic-cyan',
    iconSurface: 'border-dynamic-cyan/25 bg-dynamic-cyan/10',
    badge: 'border-dynamic-cyan/30 bg-dynamic-cyan/10 text-dynamic-cyan',
    check: 'text-dynamic-cyan',
    checkSurface: 'border-dynamic-cyan/25 bg-dynamic-cyan/10',
    inheritRow: 'border-dynamic-cyan/20 bg-dynamic-cyan/[0.07]',
    cta: 'bg-dynamic-cyan text-background hover:bg-dynamic-cyan/90',
    column: 'text-dynamic-cyan',
  },
  gray: {
    border: 'border-dynamic-gray/35',
    hoverBorder: 'hover:border-dynamic-gray/30',
    rule: 'via-dynamic-gray/50',
    bloom: 'bg-dynamic-gray/25',
    aura: 'bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--gray)_45%,transparent),transparent)]',
    halo: 'bg-[radial-gradient(60%_50%_at_50%_0%,color-mix(in_oklab,var(--gray)_50%,transparent),transparent_72%)]',
    icon: 'text-dynamic-gray',
    iconSurface: 'border-dynamic-gray/25 bg-dynamic-gray/10',
    badge: 'border-dynamic-gray/30 bg-dynamic-gray/10 text-dynamic-gray',
    check: 'text-dynamic-gray',
    checkSurface: 'border-dynamic-gray/25 bg-dynamic-gray/10',
    inheritRow: 'border-dynamic-gray/20 bg-dynamic-gray/[0.07]',
    cta: 'bg-dynamic-gray text-background hover:bg-dynamic-gray/90',
    column: 'text-dynamic-gray',
  },
};
