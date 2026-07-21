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

  if (!heroImage) return null;

  return (
    <section
      className={cn(
        'grid overflow-hidden md:grid-cols-[minmax(0,1.08fr)_minmax(18rem,0.92fr)]',
        storefrontSurfaceClasses[storefront.surfaceStyle],
        radius
      )}
    >
      <div className="flex min-h-80 flex-col justify-between gap-10 p-6 sm:p-8 lg:p-10">
        <div className="flex items-center gap-2 font-mono text-muted-foreground text-xs uppercase tracking-[0.16em]">
          <Store className="size-4" />
          <span>{labels.browse}</span>
        </div>
        <div className="max-w-2xl">
          <h2 className="text-balance font-semibold text-4xl tracking-[-0.035em] sm:text-5xl lg:text-6xl">
            {storefront.name}
          </h2>
          {storefront.description?.trim() ? (
            <p className="mt-4 max-w-xl text-pretty text-muted-foreground leading-7">
              {storefront.description.trim()}
            </p>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-2">
            <Badge className="border-border bg-background" variant="outline">
              {listingsCount} {labels.product}
            </Badge>
            <Badge className="border-border bg-background" variant="outline">
              {currency}
            </Badge>
            <Badge className="border-border bg-background" variant="outline">
              {storefront.visibility === 'public'
                ? labels.publicStore
                : labels.privateStore}
            </Badge>
          </div>
        </div>
      </div>

      <div className="relative min-h-64 border-border border-t md:min-h-full md:border-t-0 md:border-l">
        <StorefrontImagePanel
          className="absolute inset-0 h-full w-full"
          imageUrl={heroImage}
          label={storefront.name}
          priority
        />
      </div>
    </section>
  );
}
