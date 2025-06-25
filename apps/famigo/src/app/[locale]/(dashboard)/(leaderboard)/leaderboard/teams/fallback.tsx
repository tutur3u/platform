import { Card, CardContent } from '@tuturuuu/ui/card';
import { Skeleton } from '@tuturuuu/ui/skeleton';

export default function TeamsLeaderboardFallback() {
  return (
    <div className="w-full">
      {/* Basic Information Skeleton */}
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: Skeleton components for static loading state
          <Card key={`team-stat-${i}`} className="overflow-hidden">
            <CardContent className="p-4">
              <Skeleton className="mb-2 h-4 w-1/3" />
              <Skeleton className="h-8 w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Top Three Skeleton */}
      <div className="mb-8">
        <Skeleton className="mb-4 h-6 w-56" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Skeleton components for static loading state
            <Card key={`team-top-card-${i}`} className="overflow-hidden">
              <CardContent className="p-6">
                <div className="flex flex-col items-center">
                  <Skeleton className="mb-3 h-16 w-16 rounded-full" />
                  <Skeleton className="mb-2 h-5 w-24" />
                  <Skeleton className="h-4 w-12" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Filters Skeleton */}
      <div className="mb-4">
        <Skeleton className="h-10 w-full" />
      </div>

      {/* Leaderboard Table Skeleton */}
      <Card>
        <CardContent className="p-4">
          {/* biome-ignore lint/suspicious/noArrayIndexKey: Skeleton components for static loading state */}
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={`team-entry-${i}`}
              className="flex items-center justify-between border-b py-4"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="h-6 w-6" />
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-5 w-32" />
              </div>
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
