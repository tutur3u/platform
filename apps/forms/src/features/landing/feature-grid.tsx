import { SurfaceCard } from '@tuturuuu/ui/marketing';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { LandingItem } from './landing-config';

const columnClasses = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
} as const;

interface FeatureGridProps {
  items: LandingItem[];
  /**
   * Namespace holding `<key>.title` / `<key>.description` for every item, e.g.
   * `forms.landing.build.blocks`.
   */
  namespace: string;
  columns?: keyof typeof columnClasses;
  layout?: 'stack' | 'inline';
  size?: 'md' | 'lg';
  className?: string;
}

/**
 * Renders a `LandingItem[]` as a grid of `SurfaceCard`s.
 *
 * Every feature block on the landing page is the same shape — icon, accent,
 * title, description — so they all route through here instead of each section
 * re-typing the same `.map()` over a card.
 */
export function FeatureGrid({
  items,
  namespace,
  columns = 3,
  layout = 'stack',
  size = 'md',
  className,
}: FeatureGridProps) {
  // The namespace is chosen by the caller, so neither it nor the keys beneath
  // it can be checked against the message tree statically. Parity between `en`
  // and `vi` is enforced by the repo's i18n gates instead.
  const t = useTranslations(namespace as never) as unknown as (
    key: string
  ) => string;

  return (
    <div className={cn('grid gap-3', columnClasses[columns], className)}>
      {items.map((item) => (
        <SurfaceCard
          accent={item.accent}
          description={t(`${item.key}.description`)}
          icon={item.icon}
          key={item.key}
          layout={layout}
          size={size}
          title={t(`${item.key}.title`)}
        />
      ))}
    </div>
  );
}
