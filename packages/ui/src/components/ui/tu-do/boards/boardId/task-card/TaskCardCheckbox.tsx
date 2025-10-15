import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { cn } from '@tuturuuu/utils/format';
import { memo } from 'react';
import { getListColorClasses } from '../../../utils/taskColorUtils';
import { isOverdue } from '../../../utils/taskDateUtils';

interface TaskCardCheckboxProps {
  task: Task;
  taskList?: TaskList;
  isLoading: boolean;
  onToggle: (checked: boolean) => void;
}

export const TaskCardCheckbox = memo(function TaskCardCheckbox({
  task,
  taskList,
  isLoading,
  onToggle,
}: TaskCardCheckboxProps) {
  const taskIsOverdue = isOverdue(task.end_date);

  return (
    <Checkbox
      checked={!!task.closed_at}
      className={cn(
        'h-4 w-4 flex-none transition-all duration-200',
        'data-[state=checked]:border-dynamic-green/70 data-[state=checked]:bg-dynamic-green/70',
        'hover:scale-110 hover:border-primary/50',
        getListColorClasses(taskList?.color as SupportedColor),
        taskIsOverdue &&
          !task.closed_at &&
          'border-dynamic-red/70 bg-dynamic-red/10 ring-1 ring-dynamic-red/20'
      )}
      disabled={isLoading}
      onCheckedChange={onToggle}
      onClick={(e) => e.stopPropagation()}
    />
  );
});
