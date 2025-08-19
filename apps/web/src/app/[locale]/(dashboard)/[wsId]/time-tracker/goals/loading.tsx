import { Skeleton } from '@tuturuuu/ui/skeleton';

export default function Loading() {
  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <Skeleton className="mb-2 h-9 w-48" />
        <Skeleton className="h-5 w-80" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map(() => (
          <Skeleton key={crypto.randomUUID()} className="h-24 w-full" />
        ))}
      </div>
    </div>
  );
}
