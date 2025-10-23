export function AnalyticsSkeleton() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-4 h-7 w-48 animate-pulse rounded bg-gray-200" />
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg bg-gray-100 p-4">
              <div className="mb-2 h-4 w-20 animate-pulse rounded bg-gray-200" />
              <div className="h-8 w-16 animate-pulse rounded bg-gray-200" />
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-12 animate-pulse rounded bg-gray-200" />
          </div>
          <div className="h-4 w-full animate-pulse rounded-full bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

export function FileGridSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white"
        >
          <div className="h-48 w-full animate-pulse bg-gray-200" />
          <div className="space-y-2 p-3">
            <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
            <div className="flex items-center justify-between">
              <div className="h-3 w-20 animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-12 animate-pulse rounded bg-gray-200" />
            </div>
            <div className="flex gap-2">
              <div className="h-8 flex-1 animate-pulse rounded bg-gray-200" />
              <div className="h-8 flex-1 animate-pulse rounded bg-gray-200" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function FileListSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded-lg bg-gray-50 p-3"
        >
          <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-16 animate-pulse rounded bg-gray-200" />
        </div>
      ))}
    </div>
  );
}
