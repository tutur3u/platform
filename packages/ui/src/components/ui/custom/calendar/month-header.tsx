import { Button } from '../../button';
import { cn } from '@ncthub/utils/format';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export const MonthHeader: React.FC<{
  thisYear: number;
  thisMonth: string;
  handlePrev: () => void;
  handleNext: () => void;
  currentDate: Date;
  onYearViewClick: () => void;
  hideControls?: boolean;
  hideYear?: boolean;
}> = ({
  thisYear,
  thisMonth,
  handlePrev,
  handleNext,
  currentDate,
  onYearViewClick,
  hideControls = false,
  hideYear = false,
}) => (
  <div
    className={cn(
      'flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xl font-bold md:text-2xl',
      hideControls || 'mb-4'
    )}
  >
    <div className="flex items-center gap-1">
      {hideYear || thisYear}
      {hideYear || <div className="mx-2 h-4 w-px rotate-30 bg-foreground/20" />}
      <span className="text-lg font-semibold md:text-xl">{thisMonth}</span>
    </div>
    {!hideControls && (
      <div className="flex items-center gap-1">
        <Button size="xs" variant="secondary" onClick={onYearViewClick}>
          Year View
        </Button>
        <Button size="xs" variant="secondary" onClick={handlePrev}>
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <Button
          size="xs"
          variant="secondary"
          onClick={handleNext}
          disabled={
            currentDate.getMonth() === new Date().getMonth() &&
            currentDate.getFullYear() === new Date().getFullYear()
          }
        >
          <ChevronRight className="h-6 w-6" />
        </Button>
      </div>
    )}
  </div>
);
