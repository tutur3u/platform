import { Loader2 } from '@tuturuuu/icons';

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
          className="h-4 w-4 animate-spin motion-reduce:animate-none"
        />
      ) : null}
      {label}
      {isFetching ? <span className="sr-only">{srLabel}</span> : null}
    </>
  );
}
