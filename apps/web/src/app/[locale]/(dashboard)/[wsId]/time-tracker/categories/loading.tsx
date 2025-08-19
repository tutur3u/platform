import { Skeleton } from '@tuturuuu/ui/skeleton';

export default function Loading() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <Skeleton className="mb-2 h-9 w-48" />
        <Skeleton className="h-5 w-80" />
      </div>
      <div className="space-y-4">
        <Skeleton key="category-skeleton-1" className="h-16 w-full" />
        <Skeleton key="category-skeleton-2" className="h-16 w-full" />
        <Skeleton key="category-skeleton-3" className="h-16 w-full" />
        <Skeleton key="category-skeleton-4" className="h-16 w-full" />
      </div>
    </div>
  );
}
