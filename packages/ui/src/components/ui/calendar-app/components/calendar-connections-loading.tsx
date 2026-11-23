import { LoadingRegion, SkeletonList } from '../../skeleton';

/** Placeholder rows for the "add more calendars" list while it loads. */
export function CalendarConnectionsLoading({ srLabel }: { srLabel: string }) {
  return (
    <LoadingRegion srLabel={srLabel} className="max-w-md space-y-2">
      <SkeletonList rows={3} withSubtitle={false} withTrailing />
    </LoadingRegion>
  );
}
