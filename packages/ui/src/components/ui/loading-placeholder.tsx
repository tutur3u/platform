import { cn } from '@tuturuuu/utils/format';
import { skeletonClassName } from './skeleton';

/**
 * Inline stand-in for a selector's value while its options load. Phrasing
 * content only, so it is valid inside `SelectValue`, buttons and labels. The
 * loading text stays available to screen readers.
 */
export function LoadingPlaceholder({
  srLabel,
  className,
}: {
  srLabel: string;
  className?: string;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        data-slot="loading-placeholder"
        className={cn(
          skeletonClassName,
          'inline-block h-3.5 w-24 align-middle',
          className
        )}
      />
      <span className="sr-only">{srLabel}</span>
    </>
  );
}
