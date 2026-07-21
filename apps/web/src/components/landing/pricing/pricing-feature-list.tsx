'use client';

import { ArrowRight, Check, Clock } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import type { PricingColorStyle } from './pricing-styles';

/**
 * Marketing copy carries its own annotations rather than structured data, so
 * the list re-reads them here. These markers must stay in sync with the `en`
 * and `vi` message bundles.
 */
const INHERIT_MARKERS = ['Everything in', 'Mọi thứ của'];
const SOON_MARKERS = ['coming soon', 'sắp ra mắt'];
const BETA_PATTERN = /\s*\(beta\)\s*/gi;
const SOON_PARENTHETICAL = /\s*\((?:coming soon|sắp ra mắt)\)\s*/gi;

type FeatureKind = 'inherit' | 'soon' | 'standard';

function classify(feature: string): FeatureKind {
  if (INHERIT_MARKERS.some((marker) => feature.includes(marker))) {
    return 'inherit';
  }
  if (SOON_MARKERS.some((marker) => feature.includes(marker))) return 'soon';
  return 'standard';
}

/** Small square glyph holder — gives every row the same optical left edge. */
function Glyph({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'mt-px flex h-[1.125rem] w-[1.125rem] shrink-0 items-center justify-center rounded-[0.4rem] border',
        className
      )}
    >
      {children}
    </span>
  );
}

interface PricingFeatureListProps {
  features: string[];
  styles: PricingColorStyle;
  /** Translated label for not-yet-shipped rows, e.g. "Soon". */
  soonLabel: string;
  className?: string;
}

export function PricingFeatureList({
  features,
  styles,
  soonLabel,
  className,
}: PricingFeatureListProps) {
  return (
    <ul className={cn('flex flex-col gap-2.5', className)}>
      {features.map((feature) => {
        const kind = classify(feature);

        if (kind === 'inherit') {
          return (
            <li
              className={cn(
                '-mx-1.5 mb-1 flex items-center gap-2 rounded-xl border px-2.5 py-2',
                styles.inheritRow
              )}
              key={feature}
            >
              <ArrowRight className={cn('h-3.5 w-3.5 shrink-0', styles.icon)} />
              <span
                className={cn(
                  'font-mono-ui text-[0.65rem] uppercase tracking-[0.14em]',
                  styles.icon
                )}
              >
                {feature}
              </span>
            </li>
          );
        }

        if (kind === 'soon') {
          const label = feature.replace(SOON_PARENTHETICAL, ' ').trim();

          return (
            <li className="flex items-start gap-2.5" key={feature}>
              <Glyph className="border-foreground/10 bg-foreground/[0.04]">
                <Clock className="h-2.5 w-2.5 text-foreground/40" />
              </Glyph>
              <span className="flex flex-wrap items-center gap-1.5 text-foreground/40 text-sm leading-snug">
                {label}
                <span className="rounded-full border border-foreground/12 px-1.5 py-px font-mono-ui text-[0.55rem] text-foreground/45 uppercase tracking-[0.16em]">
                  {soonLabel}
                </span>
              </span>
            </li>
          );
        }

        const isBeta = BETA_PATTERN.test(feature);
        BETA_PATTERN.lastIndex = 0;
        const label = isBeta
          ? feature.replace(BETA_PATTERN, ' ').trim()
          : feature;

        return (
          <li className="flex items-start gap-2.5" key={feature}>
            <Glyph className={styles.checkSurface}>
              <Check className={cn('h-2.5 w-2.5', styles.check)} />
            </Glyph>
            <span className="flex flex-wrap items-center gap-1.5 text-foreground/70 text-sm leading-snug">
              {label}
              {isBeta ? (
                <span className="rounded-full border border-dynamic-yellow/25 bg-dynamic-yellow/10 px-1.5 py-px font-mono-ui text-[0.55rem] text-dynamic-yellow uppercase tracking-[0.16em]">
                  Beta
                </span>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
