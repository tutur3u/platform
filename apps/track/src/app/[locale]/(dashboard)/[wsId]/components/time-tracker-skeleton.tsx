import { Card, CardContent, CardHeader } from '@tuturuuu/ui/card';
import {
  LoadingRegion,
  Skeleton,
  SkeletonLine,
  SkeletonList,
} from '@tuturuuu/ui/skeleton';

/** Placeholder for the tracker (task list beside the timer card) while the user loads. */
export function TimeTrackerSkeleton({ srLabel }: { srLabel: string }) {
  return (
    <LoadingRegion
      srLabel={srLabel}
      className="grid grid-cols-1 gap-6 pb-6 lg:grid-cols-5 lg:items-start"
    >
      <Card aria-hidden="true" className="order-2 lg:order-1 lg:col-span-2">
        <CardHeader>
          <SkeletonLine size="base" barClassName="w-1/3" />
        </CardHeader>
        <CardContent>
          <SkeletonList rows={5} withAvatar={false} rowClassName="px-0" />
        </CardContent>
      </Card>
      <Card aria-hidden="true" className="order-1 lg:order-2 lg:col-span-3">
        <CardHeader>
          <SkeletonLine size="base" barClassName="w-1/4" />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Skeleton className="mx-auto h-16 w-48" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-10 w-32" />
        </CardContent>
      </Card>
    </LoadingRegion>
  );
}
