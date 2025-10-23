export default function Loading() {
  return (
    <div className="flex h-full w-full flex-col gap-6">
      {/* Breadcrumb skeleton */}
      <div className="h-12 w-full animate-pulse rounded-lg bg-foreground/5" />

      {/* Feature summary skeleton */}
      <div className="space-y-3">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-foreground/10" />
        <div className="h-5 w-96 animate-pulse rounded-lg bg-foreground/5" />
      </div>

      {/* Separator */}
      <div className="h-px w-full bg-border" />

      {/* Storage bar skeleton */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="h-4 w-20 animate-pulse rounded bg-foreground/5" />
          <div className="h-4 w-32 animate-pulse rounded bg-foreground/5" />
        </div>
        <div className="h-2 w-full animate-pulse rounded-full bg-foreground/5" />
      </div>

      {/* Statistics cards skeleton */}
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="relative overflow-hidden rounded-xl border border-dynamic-border bg-card p-6"
          >
            <div className="space-y-3">
              <div className="h-4 w-24 animate-pulse rounded bg-foreground/10" />
              <div className="h-9 w-20 animate-pulse rounded bg-foreground/15" />
              <div className="h-3 w-32 animate-pulse rounded bg-foreground/5" />
            </div>
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-4 w-32 animate-pulse rounded bg-foreground/5" />
          <div className="h-10 w-64 animate-pulse rounded-lg bg-foreground/5" />
        </div>
        <div className="rounded-lg border border-dynamic-border">
          <div className="p-4 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4"
              >
                <div className="h-5 w-5 animate-pulse rounded bg-foreground/5" />
                <div className="h-5 flex-1 animate-pulse rounded bg-foreground/5" />
                <div className="h-5 w-24 animate-pulse rounded bg-foreground/5" />
                <div className="h-5 w-32 animate-pulse rounded bg-foreground/5" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
