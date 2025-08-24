import { Card, CardContent, CardHeader } from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';

export default function DashboardCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-16" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </CardContent>
    </Card>
  );
}
