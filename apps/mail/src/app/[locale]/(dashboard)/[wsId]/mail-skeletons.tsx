import {
  LoadingRegion,
  SkeletonLine,
  SkeletonList,
  SkeletonText,
} from '@tuturuuu/ui/skeleton';

/** Message-list rows (sender over subject) while a folder loads. */
export function MailListSkeleton({ srLabel }: { srLabel: string }) {
  return (
    <LoadingRegion srLabel={srLabel} className="space-y-1">
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} aria-hidden="true" className="rounded-lg border p-3">
          <SkeletonLine size="sm" barClassName="w-1/3" />
          <SkeletonLine size="base" barClassName="w-3/4" />
        </div>
      ))}
    </LoadingRegion>
  );
}

/** Reader pane (subject, sender line, body) while a message loads. */
export function MailReaderSkeleton({ srLabel }: { srLabel: string }) {
  return (
    <LoadingRegion
      srLabel={srLabel}
      className="space-y-4 rounded-lg border p-4"
    >
      <SkeletonLine size="lg" barClassName="w-2/3" />
      <SkeletonLine size="sm" barClassName="w-1/3" />
      <SkeletonText lines={6} />
    </LoadingRegion>
  );
}

/** Rows inside a settings section while its data loads. */
export function MailSettingsRowsSkeleton({ srLabel }: { srLabel: string }) {
  return (
    <LoadingRegion srLabel={srLabel} className="px-4 py-3 md:px-5">
      <SkeletonList rows={2} withAvatar={false} withTrailing />
    </LoadingRegion>
  );
}
