import { LoadingRegion, SkeletonList } from '../skeleton';

/** Sidebar panel placeholder: a few rows, announced once as `srLabel`. */
export function LoadingState({ srLabel }: { srLabel: string }) {
  return (
    <LoadingRegion srLabel={srLabel} className="p-3">
      <SkeletonList rows={4} withAvatar={false} />
    </LoadingRegion>
  );
}
