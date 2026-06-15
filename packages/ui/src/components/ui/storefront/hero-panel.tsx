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
  const heroImage = storefront.coverImageUrl ?? storefront.heroImageUrl;

  return (
    <section
      className={cn(
        'relative isolate overflow-hidden',
        storefrontSurfaceClasses[storefront.surfaceStyle],
        radius
      )}
    >
      {/* Full-width featured banner backdrop. */}
      <div className="relative h-40 w-full sm:h-52 md:h-60">
        {heroImage ? (
          <StorefrontImagePanel
            className="absolute inset-0 h-full w-full"
            imageUrl={heroImage}
            label={storefront.name}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-muted via-muted/60 to-background" />
        )}
        {/* Scrim that fades the banner into the page so overlaid text stays legible. */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/55 to-transparent" />
      </div>

      {/* Overlaid title block — pulled up onto the lower, faded part of the banner. */}
      <div className="relative -mt-20 flex flex-col gap-4 p-5">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Store className="h-4 w-4" />
            <span>{labels.browse}</span>
          </div>
          <h2 className="mt-2 text-balance font-semibold text-3xl tracking-tight md:text-4xl">
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
    </section>
  );
}
