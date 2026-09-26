import { Skeleton } from '@tuturuuu/ui/skeleton';

export default function TutoringLoading() {
  return (
    <main className="mx-auto max-w-[1440px] space-y-6 px-3 py-5 md:px-8 md:py-8">
      <div className="space-y-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton className="h-24 rounded-xl" key={index} />
        ))}
      </div>
      <Skeleton className="h-10 w-64" />
      <div className="space-y-4 rounded-xl border p-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton className="h-9 w-full" key={index} />
        ))}
      </div>
    </main>
  );
}
