import { Skeleton } from '@tuturuuu/ui/skeleton';

const METRIC_KEYS = ['a', 'b', 'c', 'd'];
const ROW_KEYS = ['a', 'b', 'c', 'd', 'e', 'f'];

export function InventoryRouteSkeleton() {
  return (
    <main aria-busy="true" className="grid gap-4 p-2 sm:p-4">
      <section className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-8 w-56 max-w-[70vw]" />
            <Skeleton className="h-4 w-80 max-w-[85vw]" />
          </div>
          <Skeleton className="size-10 rounded-lg" />
        </div>
      </section>
      <section className="grid grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
        {METRIC_KEYS.map((key) => (
          <div className="rounded-xl border bg-card p-3 sm:p-4" key={key}>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="mt-3 h-7 w-28 max-w-full" />
            <Skeleton className="mt-2 h-3 w-full" />
          </div>
        ))}
      </section>
      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center gap-2 border-b p-3">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="size-9" />
          <Skeleton className="size-9" />
        </div>
        <div className="divide-y">
          {ROW_KEYS.map((key) => (
            <div className="flex items-center gap-3 p-3 sm:p-4" key={key}>
              <Skeleton className="size-10 shrink-0 rounded-lg" />
              <div className="grid flex-1 gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
