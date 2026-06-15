import { PackageOpen } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { getListingInitials } from './utils';

export function StorefrontImagePanel({
  className,
  imageUrl,
  label,
  priority = false,
}: {
  className?: string;
  imageUrl: string | null;
  label: string;
  /** Eager-load above-the-fold images (e.g. the hero) to protect LCP. */
  priority?: boolean;
}) {
  if (imageUrl) {
    return (
      // biome-ignore lint/performance/noImgElement: storefront images are workspace-controlled external URLs
      <img
        alt=""
        className={cn('w-full object-cover', className)}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        loading={priority ? 'eager' : 'lazy'}
        src={imageUrl}
      />
    );
  }

  return (
    <div
      className={cn(
        'grid w-full place-items-center border-border bg-muted/55 text-muted-foreground',
        className
      )}
    >
      <div className="grid place-items-center gap-2 text-center">
        <PackageOpen className="h-6 w-6" />
        <span className="max-w-24 truncate font-semibold text-sm">
          {getListingInitials(label) || label}
        </span>
      </div>
    </div>
  );
}
