import { Store } from '@tuturuuu/icons';
import type { InventoryStorefront } from '@tuturuuu/internal-api/inventory';
import { cn } from '@tuturuuu/utils/format';
import { Badge } from '../badge';
import { StorefrontImagePanel } from './image-panel';
import type { StorefrontSurfaceLabels } from './types';
import { storefrontSurfaceClasses } from './utils';

export function StorefrontHeroPanel({
  currency,
  labels,
  listingsCount,
  radius,
  storefront,
}: {
  currency: string;
  labels: StorefrontSurfaceLabels;
  listingsCount: number;
  radius: string;
  storefront: InventoryStorefront;
}) {
  return (
    <section
      className={cn(
        'grid min-h-44 overflow-hidden',
        storefrontSurfaceClasses[storefront.surfaceStyle],
        radius,
        storefront.themePreset === 'editorial'
          ? 'md:grid-cols-[minmax(0,1.15fr)_360px]'
          : 'md:grid-cols-[minmax(0,1fr)_280px]'
      )}
    >
      <div className="flex min-w-0 flex-col justify-between gap-6 p-5">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Store className="h-4 w-4" />
            <span>{labels.browse}</span>
          </div>
          <h2
            className={cn(
              'mt-3 text-balance font-semibold tracking-normal',
              storefront.themePreset === 'editorial'
                ? 'text-3xl md:text-4xl'
                : 'text-2xl'
            )}
          >
            {storefront.name}
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6">
            {storefront.description ?? labels.fallbackDescription}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="border-border bg-background" variant="outline">
            {listingsCount} {labels.product}
          </Badge>
          <Badge className="border-border bg-background" variant="outline">
            {currency}
          </Badge>
        </div>
      </div>

      <StorefrontImagePanel
        className="min-h-44 md:min-h-full"
        imageUrl={storefront.heroImageUrl}
        label={storefront.name}
      />
    </section>
  );
}
