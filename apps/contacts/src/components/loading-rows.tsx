import { Loader2 } from '@tuturuuu/icons';
import { LoadingRegion, SkeletonList } from '@tuturuuu/ui/skeleton';

/** Placeholder rows for a command list or picker while its options load. */
export function LoadingRows({
  srLabel,
  rows = 3,
  withAvatar = false,
  className,
}: {
  srLabel: string;
  rows?: number;
  withAvatar?: boolean;
  className?: string;
}) {
  return (
    <LoadingRegion srLabel={srLabel} className={className}>
      <SkeletonList rows={rows} withAvatar={withAvatar} withSubtitle={false} />
    </LoadingRegion>
  );
}

/**
 * Content for a button that loads more or runs an action. The label stays
 * put while pending; a spinner shows progress and the loading text is
 * screen-reader only.
 */
export function PendingLabel({
  isPending,
  label,
  srLabel,
}: {
  isPending: boolean;
  label: string;
  srLabel: string;
}) {
  return (
    <>
      {isPending ? (
        <Loader2
          aria-hidden="true"
          className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
        />
      ) : null}
      {label}
      {isPending ? <span className="sr-only">{srLabel}</span> : null}
    </>
  );
}
