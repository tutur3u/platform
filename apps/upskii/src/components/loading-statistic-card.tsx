import { cn } from '@tuturuuu/utils/format';

interface Props {
  className?: string;
}

export default function LoadingStatisticCard({ className }: Props) {
  return (
    <div className={cn('group animate-pulse rounded-lg border', className)}>
      <div className="p-1 text-center text-lg font-semibold text-transparent">
        ...
      </div>
      <div className="border-foreground/5 bg-foreground/5 m-2 mt-0 flex items-center justify-center rounded border p-4 text-2xl font-bold text-transparent">
        ...
      </div>
    </div>
  );
}
