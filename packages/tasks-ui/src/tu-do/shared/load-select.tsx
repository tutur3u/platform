import { LoadingRegion, SkeletonSelectorTrigger } from '@tuturuuu/ui/skeleton';

/** Select-sized placeholder shown while a picker's options load. */
export function LoadSelect({ srLabel }: { srLabel: string }) {
  return (
    <LoadingRegion srLabel={srLabel}>
      <SkeletonSelectorTrigger />
    </LoadingRegion>
  );
}
