import { cn } from '@tuturuuu/utils/format';
import { isAfter } from 'date-fns';
import { Fragment } from 'react';
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
  // eslint-disable-next-line no-unused-vars
  onDateClick?: (date: Date) => void;
}> = ({ day, currentDate, today, attendanceData, onDateClick }) => {
  const isInCurrentMonth = isCurrentMonth(day, currentDate);
  
  // Cache attendance checks
  const isAttended = isDateAttended(day, attendanceData);
  const isAbsent = isDateAbsent(day, attendanceData);
  const hasAttendance = isAttended || isAbsent;

  if (!hasAttendance) {
    return (
      <button
        onClick={onDateClick ? () => onDateClick(day) : undefined}
        className={cn(
          'flex flex-none justify-center rounded border bg-foreground/5 p-2 font-semibold transition duration-300 hover:cursor-pointer md:rounded-lg dark:bg-foreground/10',
          isAfter(day, today) &&
            '!cursor-not-allowed opacity-50 hover:!cursor-not-allowed',
          !isInCurrentMonth && 'text-foreground/40 bg-foreground/3 dark:bg-foreground/5',
          isInCurrentMonth && 'text-foreground/40'
        )}
      >
        {day.getDate()}
      </button>
    );
  }

  return (
    <Fragment>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onDateClick ? () => onDateClick(day) : undefined}
            className={cn(
              'flex flex-none cursor-pointer justify-center rounded border p-2 font-semibold transition duration-300 md:rounded-lg',
              isAttended
                ? 'border-green-500/30 bg-green-500/10 text-green-600 dark:border-green-300/20 dark:bg-green-300/20 dark:text-green-300'
                : isAbsent
                  ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:border-red-300/20 dark:bg-red-300/20 dark:text-red-300'
                  : 'bg-foreground/5 text-foreground/40 dark:bg-foreground/10',
              !isInCurrentMonth && 'opacity-60'
            )}
          >
            {day.getDate()}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {getAttendanceGroupNames(day, attendanceData).map(
            (groupName, idx) => (
              <div key={groupName + idx} className="flex items-center gap-1">
                <span className="text-xs font-semibold">{groupName}</span>
              </div>
            )
          )}
        </TooltipContent>
      </Tooltip>
    </Fragment>
  );
};
