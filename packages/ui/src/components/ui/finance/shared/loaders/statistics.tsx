import { cn } from '@tuturuuu/utils/format';
import { Card } from '../../../card';
import { Skeleton } from '../../../skeleton';

interface Props {
  className?: string;
}

/** Mirrors StatisticCard (title, value, icon tile) so loading does not shift. */
export default function LoadingStatisticCard({ className }: Props) {
  return (
    <Card className={cn('h-full', className)} aria-hidden="true">
      <div className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-9 w-32" />
          </div>
          <Skeleton className="size-11 shrink-0 rounded-lg" />
        </div>
      </div>
    </Card>
  );
}
