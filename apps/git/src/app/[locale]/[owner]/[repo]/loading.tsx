export default function RepositoryLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="h-14 animate-pulse border-b bg-muted/30" />
      <div className="mx-auto grid max-w-[1560px] gap-6 px-4 py-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="h-12 animate-pulse rounded-lg bg-muted" />
          <div className="h-[420px] animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="space-y-3">
          <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-24 animate-pulse rounded bg-muted" />
          <div className="h-32 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}
