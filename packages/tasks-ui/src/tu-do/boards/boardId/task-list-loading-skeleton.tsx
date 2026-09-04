import { Skeleton } from '@tuturuuu/ui/skeleton';

const CARD_HEIGHTS = ['h-28', 'h-24', 'h-32'];

export function TaskListLoadingSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-1 flex-col gap-2 overflow-hidden p-3"
      data-testid="task-list-loading-skeleton"
    >
      {CARD_HEIGHTS.map((height, index) => (
        <div
          className={`rounded-lg border border-border/35 p-3 ${height}`}
          key={height}
        >
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-20 rounded-md" />
            <Skeleton className="size-4 rounded-full" />
          </div>
          <Skeleton
            className={`mt-3 h-4 rounded-md ${index === 1 ? 'w-3/5' : 'w-4/5'}`}
          />
          <Skeleton className="mt-2 h-3 w-2/5 rounded-md" />
          <div className="mt-4 flex gap-1.5">
            <Skeleton className="h-5 w-14 rounded-md" />
            <Skeleton className="h-5 w-20 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}
