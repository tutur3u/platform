import { cn } from '@tuturuuu/utils/format';

interface Props {
  className?: string;
}

export default function LoadingStatisticCard({ className }: Props) {
  return (
    <div className={cn('group animate-pulse rounded-lg border', className)}>
      <div className="p-1 text-center font-semibold text-lg text-transparent">
        ...
      </div>
      <div className="m-2 mt-0 flex items-center justify-center rounded border border-foreground/5 bg-foreground/5 p-4 font-bold text-2xl text-transparent">
        ...
      </div>
    </div>
  );
}
