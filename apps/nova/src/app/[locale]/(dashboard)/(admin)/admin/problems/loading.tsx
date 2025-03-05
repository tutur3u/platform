import { Skeleton } from '@tuturuuu/ui/skeleton';

export default function LoadingProblems() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="rounded-lg border border-gray-200 p-4 shadow-sm"
        >
          <Skeleton className="mb-4 h-40 w-full rounded-md" />
          <Skeleton className="mb-2 h-6 w-3/4" />
          <Skeleton className="mb-4 h-4 w-1/2" />
          <div className="flex justify-between">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
      ))}
    </>
  );
}
