import { Calendar, Clock } from '@tuturuuu/icons';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Badge } from '@tuturuuu/ui/badge';
import { useCalendarPreferences } from '@tuturuuu/ui/hooks/use-calendar-preferences';
import { cn } from '@tuturuuu/utils/format';
import { getTimeFormatPattern } from '@tuturuuu/utils/time-helper';
import { format } from 'date-fns';
import { memo } from 'react';
import {
  formatSmartDate,
  isFutureDate,
  isOverdue,
} from '../../../utils/taskDateUtils';

interface TaskCardDatesProps {
  task: Task;
  taskList?: TaskList;
}

export const TaskCardDates = memo(function TaskCardDates({
  task,
  taskList,
}: TaskCardDatesProps) {
  const { timeFormat } = useCalendarPreferences();
  const timePattern = getTimeFormatPattern(timeFormat);
  const startDate = task.start_date ? new Date(task.start_date) : null;
  const endDate = task.end_date ? new Date(task.end_date) : null;
  const taskIsOverdue = isOverdue(endDate);

  // Hide dates when task is in done/closed list
  if (taskList?.status === 'done' || taskList?.status === 'closed') {
    return null;
  }

  // Don't render if no dates
  if (!startDate && !endDate) {
    return null;
  }

  return (
    <div className="mb-1 space-y-0.5 text-[10px] leading-snug">
      {/* Show start only if in the future (hide historical start for visual simplicity) */}
      {startDate && isFutureDate(startDate) && (
        <div className="flex items-center gap-1 text-muted-foreground">
          <Clock className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">Starts {formatSmartDate(startDate)}</span>
        </div>
      )}
      {endDate && (
        <div
          className={cn(
            'flex items-center gap-1',
            taskIsOverdue && !task.closed_at
              ? 'font-medium text-dynamic-red'
              : 'text-muted-foreground'
          )}
        >
          <Calendar className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">Due {formatSmartDate(endDate)}</span>
          {taskIsOverdue && !task.closed_at ? (
            <Badge className="ml-1 h-4 bg-dynamic-red px-1 font-semibold text-[9px] text-white tracking-wide">
              OVERDUE
            </Badge>
          ) : (
            <span className="ml-1 hidden text-[10px] text-muted-foreground md:inline">
              {format(endDate, `MMM dd 'at' ${timePattern}`)}
            </span>
          )}
        </div>
      )}
    </div>
  );
});
