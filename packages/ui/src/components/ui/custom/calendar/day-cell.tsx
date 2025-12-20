import { cn } from '@tuturuuu/utils/format';
import { isAfter } from 'date-fns';
import { Tooltip, TooltipContent, TooltipTrigger } from '../../tooltip';
import {
  getAttendanceGroupNames,
  isCurrentMonth,
  isDateAbsent,
  isDateAttended,
  type WorkspaceUserAttendance,
} from './utils';

export const DayCell: React.FC<{
  day: Date;
  currentDate: Date;
  today: Date;
  attendanceData?: WorkspaceUserAttendance[];

  onDateClick?: (date: Date) => void;
  /** When true, hides days from previous and next months to reduce visual clutter */
  hideOutsideMonthDays?: boolean;
}> = ({
  day,
  currentDate,
  today,
  attendanceData,
  onDateClick,
  hideOutsideMonthDays = false,
}) => {
  const isInCurrentMonth = isCurrentMonth(day, currentDate);

  // If hideOutsideMonthDays is true and day is not in current month, don't render anything
  if (hideOutsideMonthDays && !isInCurrentMonth) {
    return <div className="flex flex-none justify-center p-2"></div>;
  }

  // Cache attendance checks
  const isAttended = isDateAttended(day, attendanceData);
  const isAbsent = isDateAbsent(day, attendanceData);
  const hasAttendance = isAttended || isAbsent;

  if (!hasAttendance) {
    return (
      <button
        type="button"
        onClick={onDateClick ? () => onDateClick(day) : undefined}
        className={cn(
          'flex flex-none justify-center rounded border bg-foreground/5 p-2 font-semibold transition duration-300 hover:cursor-pointer md:rounded-lg dark:bg-foreground/10',
          isAfter(day, today) &&
            'cursor-not-allowed! opacity-50 hover:cursor-not-allowed!',
          !isInCurrentMonth &&
            'bg-foreground/3 text-foreground/40 dark:bg-foreground/5',
          isInCurrentMonth && 'text-foreground/40'
        )}
      >
        {day.getDate()}
      </button>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onDateClick ? () => onDateClick(day) : undefined}
          className={cn(
            'flex flex-none cursor-pointer justify-center rounded border p-2 font-semibold transition duration-300 md:rounded-lg',
            isAttended
              ? 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green dark:border-dynamic-green/20 dark:bg-dynamic-green/20'
              : isAbsent
                ? 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red dark:border-dynamic-red/20 dark:bg-dynamic-red/20'
                : 'bg-foreground/5 text-foreground/40 dark:bg-foreground/10',
            !isInCurrentMonth && 'opacity-60'
          )}
        >
          {day.getDate()}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {getAttendanceGroupNames(day, attendanceData).map((groupName, idx) => (
          <div key={groupName + idx} className="flex items-center gap-1">
            <span className="font-semibold text-xs">{groupName}</span>
          </div>
        ))}
      </TooltipContent>
    </Tooltip>
  );
};
