import { Card } from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';

/**
 * Loading placeholder for the users table. Mirrors the toolbar → table → pager
 * layout so the page does not shift when {@link UsersTabContent} streams in.
 */
export function UsersTableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Skeleton className="h-9 w-full max-w-xs" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
        </div>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="flex items-center gap-4 border-b bg-foreground/5 px-4 py-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={`head-${i}`} className="h-4 w-28" />
          ))}
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={`row-${i}`}
            className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0"
          >
            <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="ml-auto h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </Card>

      {/* Pagination */}
      <Skeleton className="h-12 w-full rounded-lg" />
    </div>
  );
}
