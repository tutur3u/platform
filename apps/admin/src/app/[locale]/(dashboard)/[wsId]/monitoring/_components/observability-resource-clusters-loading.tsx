import { Gauge } from '@tuturuuu/icons';

export function ResourceClusterSkeleton() {
  return (
    <section className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-center gap-3">
        <Gauge className="h-4 w-4 text-muted-foreground" />
        <div className="h-4 w-44 animate-pulse rounded bg-muted" />
      </div>
      <div className="mt-4 space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div className="h-12 animate-pulse rounded-md bg-muted" key={index} />
        ))}
      </div>
    </section>
  );
}
