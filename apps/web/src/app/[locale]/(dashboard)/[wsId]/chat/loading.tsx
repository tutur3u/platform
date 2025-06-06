export default function Loading() {
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-4 pt-10 lg:max-w-4xl xl:max-w-6xl">
      <div className="h-64 animate-pulse rounded-lg border bg-foreground/5 p-4 md:p-8" />
      <div className="h-64 animate-pulse rounded-lg border bg-foreground/5 p-4 md:p-8" />
    </div>
  );
}
