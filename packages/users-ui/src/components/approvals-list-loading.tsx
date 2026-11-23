import { Card, CardContent } from '@tuturuuu/ui/card';
import { LoadingRegion, SkeletonLine } from '@tuturuuu/ui/skeleton';

/** Placeholder approval cards shown while the approvals list loads. */
export function ApprovalsListLoading({ srLabel }: { srLabel: string }) {
  return (
    <LoadingRegion srLabel={srLabel} className="grid gap-3 md:gap-4">
      {Array.from({ length: 4 }, (_, index) => (
        <Card
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          key={index}
          aria-hidden="true"
          className="border-border/60"
        >
          <CardContent className="space-y-2 p-4 md:p-5">
            <SkeletonLine size="sm" barClassName="w-1/3" />
            <SkeletonLine size="xs" barClassName="w-1/2" />
          </CardContent>
        </Card>
      ))}
    </LoadingRegion>
  );
}
