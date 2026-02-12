import { Card, CardContent, CardHeader } from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';

export default function ManagementCardSkeleton() {
  return (
    <Card className="border-dynamic-border/20">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Skeleton className="size-5 rounded" />
          <Skeleton className="h-5 w-32" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
