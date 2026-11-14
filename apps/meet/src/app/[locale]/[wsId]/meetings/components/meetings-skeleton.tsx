/** Placeholder for the Meetings home while hosting eligibility resolves. */
export function MeetingsSkeleton() {
  return (
    <div aria-busy className="space-y-8">
      <div className="flex gap-2">
        <div className="h-8 w-36 animate-pulse rounded-md bg-muted" />
        <div className="h-8 w-28 animate-pulse rounded-md bg-muted" />
      </div>
      <div className="space-y-3">
        <div className="h-5 w-24 animate-pulse rounded bg-muted" />
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {[0, 1, 2].map((row) => (
            <div className="space-y-2 px-4 py-4 md:px-5" key={row}>
              <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/4 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
