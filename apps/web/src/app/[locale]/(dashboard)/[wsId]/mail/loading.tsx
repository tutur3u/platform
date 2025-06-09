export default function Loading() {
  return (
    <div className="flex h-full w-full flex-col gap-4 p-4">
      <div className="h-10 w-48 animate-pulse rounded-lg bg-foreground/5" />
      <div className="h-full w-full animate-pulse rounded-lg bg-foreground/5" />
    </div>
  );
}
