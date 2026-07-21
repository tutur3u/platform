const SKELETON_CARD_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'];

export function StorefrontSkeleton({ label }: { label?: string }) {
  return (
    <main aria-busy="true" className="min-h-dvh bg-background">
      {label ? <span className="sr-only">{label}</span> : null}
      <header className="border-border border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
          <div className="h-6 w-40 animate-pulse rounded-md bg-muted" />
          <div className="h-11 w-16 animate-pulse rounded-xl bg-muted" />
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-4 py-5">
        <div className="min-w-0">
          <div className="grid min-h-80 animate-pulse overflow-hidden rounded-xl border border-border md:grid-cols-2">
            <div className="flex flex-col justify-end gap-4 p-8">
              <div className="h-3 w-28 rounded bg-muted" />
              <div className="h-10 w-3/4 rounded bg-muted" />
              <div className="h-4 w-2/3 rounded bg-muted" />
            </div>
            <div className="border-border border-t bg-muted/60 md:border-t-0 md:border-l" />
          </div>
          <div className="mt-10 h-10 w-52 animate-pulse rounded bg-muted" />
          <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {SKELETON_CARD_KEYS.map((key) => (
              <div
                className="animate-pulse overflow-hidden rounded-xl border border-border bg-card"
                key={key}
              >
                <div className="aspect-[5/4] w-full bg-muted" />
                <div className="p-5">
                  <div className="h-4 w-3/4 rounded bg-muted" />
                  <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
