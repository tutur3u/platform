import { Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { LoadingRegion, Skeleton, SkeletonList } from '@tuturuuu/ui/skeleton';

/** Full-size placeholder for an attachment preview that is still loading. */
export function AttachmentPreviewLoading({ srLabel }: { srLabel: string }) {
  return (
    <LoadingRegion srLabel={srLabel} className="w-full p-4">
      <Skeleton aria-hidden="true" className="h-[40vh] w-full" />
    </LoadingRegion>
  );
}

/** Placeholder rows shaped like the existing-attachment list. */
export function ExistingAttachmentsLoading({ srLabel }: { srLabel: string }) {
  return (
    <LoadingRegion srLabel={srLabel} className="space-y-2">
      <SkeletonList rows={2} rowClassName="rounded-md border" />
    </LoadingRegion>
  );
}

/** "Load more" keeps its label; a spinner and sr-only text show progress. */
export function LoadMoreAttachmentsButton({
  label,
  srLabel,
  loading,
  onLoadMore,
}: {
  label: string;
  srLabel: string;
  loading: boolean;
  onLoadMore?: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="w-full"
      aria-busy={loading}
      disabled={loading || !onLoadMore}
      onClick={onLoadMore}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
      ) : null}
      {label}
      {loading ? <span className="sr-only">{srLabel}</span> : null}
    </Button>
  );
}
