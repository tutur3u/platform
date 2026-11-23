import { Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';

/**
 * Content for a "load more" button. The label stays put while the next page
 * loads; a spinner shows progress and the loading text is screen-reader only.
 */
export function LoadMoreLabel({
  isFetching,
  label,
  srLabel,
}: {
  isFetching: boolean;
  label: string;
  srLabel: string;
}) {
  return (
    <>
      {isFetching ? (
        <Loader2
          aria-hidden="true"
          className="mr-2 size-4 animate-spin motion-reduce:animate-none"
        />
      ) : null}
      {label}
      {isFetching ? <span className="sr-only">{srLabel}</span> : null}
    </>
  );
}

/** Outline "load more" button that stays labelled and disabled while fetching. */
export function LoadMoreButton({
  isFetching,
  label,
  onClick,
  srLabel,
}: {
  isFetching: boolean;
  label: string;
  onClick: () => void;
  srLabel: string;
}) {
  return (
    <Button
      aria-busy={isFetching || undefined}
      disabled={isFetching}
      onClick={onClick}
      size="sm"
      variant="outline"
    >
      <LoadMoreLabel isFetching={isFetching} label={label} srLabel={srLabel} />
    </Button>
  );
}
