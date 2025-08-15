import { cn } from '@tuturuuu/utils/format';
import { Calendar, Clock } from 'lucide-react';

interface TimeColumnHeadersProps {
  showSecondary: boolean;
  secondaryTzAbbr?: string;
  primaryTzAbbr?: string;
  variant?: 'weekday' | 'all-day';
}

export const TimeColumnHeaders = ({
  showSecondary,
  secondaryTzAbbr,
  primaryTzAbbr,
  variant = 'weekday',
}: TimeColumnHeadersProps) => {
  const isWeekday = variant === 'weekday';

  return (
    <div className="flex">
      {/* Secondary timezone header (shows on left when enabled) */}
      {showSecondary && (
        <div
          className={cn(
            'flex w-16 items-center justify-center border bg-muted/20',
            isWeekday
              ? 'flex-col rounded-tl-lg border-r-0 p-1 font-medium'
              : 'border-b border-l p-2 font-medium'
          )}
        >
          {isWeekday ? (
            <div className="font-medium text-[10px] text-muted-foreground/70">
              {secondaryTzAbbr}
            </div>
          ) : (
            <div className="h-4 w-4" />
          )}
        </div>
      )}

      {/* Primary timezone header */}
      <div
        className={cn(
          'flex w-16 items-center justify-center border bg-muted/30',
          isWeekday
            ? `flex-col border-r-0 p-1 font-medium ${!showSecondary ? 'rounded-tl-lg' : ''}`
            : 'border-b border-l p-2 font-medium'
        )}
      >
        {isWeekday ? (
          <>
            <Clock className="mb-0.5 h-3 w-3 text-muted-foreground" />
            <div className="font-medium text-[10px] text-muted-foreground">
              {primaryTzAbbr}
            </div>
          </>
        ) : (
          <Calendar className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
    </div>
  );
};
