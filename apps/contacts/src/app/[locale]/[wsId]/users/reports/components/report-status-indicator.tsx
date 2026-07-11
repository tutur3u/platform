import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

export interface ReportStatusCounts {
  pending_count: number;
  approved_count: number;
  rejected_count: number;
}

interface ReportStatusIndicatorProps {
  counts: ReportStatusCounts | undefined;
  className?: string;
}

export function ReportStatusIndicator({
  counts,
  className,
}: ReportStatusIndicatorProps) {
  const t = useTranslations('ws-reports');

  if (!counts) return null;

  const { pending_count, approved_count, rejected_count } = counts;
  const total = pending_count + approved_count + rejected_count;

  if (total === 0) return null;

  const hasRejected = rejected_count > 0;
  const hasPending = pending_count > 0;
  const allApproved = approved_count === total;

  const dotColor = hasRejected
    ? 'bg-dynamic-red'
    : allApproved
      ? 'bg-dynamic-green'
      : hasPending
        ? 'bg-dynamic-yellow'
        : 'bg-dynamic-green';

  const summary = t('status_summary', {
    approved: approved_count,
    pending: pending_count,
    rejected: rejected_count,
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-block h-2 w-2 shrink-0 rounded-full',
            dotColor,
            className
          )}
        />
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {summary}
      </TooltipContent>
    </Tooltip>
  );
}
