import { Skeleton } from '@tuturuuu/ui/skeleton';
import {
  PostStatusSummarySkeleton,
  PostsTableSkeleton,
} from '../posts/loading-skeletons';

export default function ReportsLoading() {
  return (
    <main className="space-y-4 p-2 md:space-y-6 md:p-6">
      <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4 md:p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <div className="grid h-10 w-full grid-cols-3 gap-1 rounded-lg bg-muted p-1 md:w-96">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={`tab-${index}`} className="h-8 w-full" />
        ))}
      </div>
      <PostStatusSummarySkeleton />
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <PostsTableSkeleton />
      </div>
    </main>
  );
}
