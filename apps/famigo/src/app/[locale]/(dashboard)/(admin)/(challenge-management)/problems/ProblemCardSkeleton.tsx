import { Skeleton } from '@tuturuuu/ui/skeleton';

function getSkeletonId(index: number) {
  return `problem-skeleton-${index}-${Math.random().toString(36).substr(2, 9)}`;
}

export default function ProblemCardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={getSkeletonId(index)}
          className="rounded-lg border p-4 shadow-sm"
        >
          <Skeleton className="mb-4 h-40 w-full rounded-md" />
          <Skeleton className="mb-2 h-6 w-3/4" />
          <Skeleton className="mb-4 h-4 w-1/2" />
          <div className="flex justify-between">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      ))}
    </div>
  );
}
