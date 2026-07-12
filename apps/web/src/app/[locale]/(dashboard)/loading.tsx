function SkeletonBar({ className }: { className: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-foreground/8 ${className}`} />
  );
}

export default function DashboardLoading() {
  return (
    <div aria-busy="true" className="flex min-h-dvh bg-root-background">
      <aside className="hidden w-64 shrink-0 border-r bg-background/70 p-4 md:block">
        <div className="flex items-center gap-3 border-b pb-4">
          <SkeletonBar className="size-9" />
          <SkeletonBar className="h-5 w-32" />
        </div>
        <div className="mt-5 space-y-2">
          {Array.from({ length: 8 }, (_, index) => (
            <div
              className="flex items-center gap-3 rounded-xl px-2 py-2"
              key={index}
            >
              <SkeletonBar className="size-5" />
              <SkeletonBar
                className={index % 3 === 0 ? 'h-4 w-36' : 'h-4 w-24'}
              />
            </div>
          ))}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex h-16 items-center justify-between border-b bg-background/70 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <SkeletonBar className="size-9 md:hidden" />
            <SkeletonBar className="h-5 w-36" />
          </div>
          <div className="flex items-center gap-2">
            <SkeletonBar className="size-9" />
            <SkeletonBar className="size-9 rounded-full" />
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
          <div className="mb-8 space-y-3">
            <SkeletonBar className="h-8 w-56 max-w-full" />
            <SkeletonBar className="h-4 w-96 max-w-full" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <section
                className="space-y-4 rounded-2xl border bg-background/60 p-5"
                key={index}
              >
                <div className="flex items-center justify-between">
                  <SkeletonBar className="h-5 w-28" />
                  <SkeletonBar className="size-8" />
                </div>
                <SkeletonBar className="h-24 w-full" />
                <SkeletonBar className="h-4 w-2/3" />
              </section>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
