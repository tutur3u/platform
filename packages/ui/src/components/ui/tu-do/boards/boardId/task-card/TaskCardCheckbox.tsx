import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { Task } from '@tuturuuu/types/primitives/Task';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { isTaskBoardResolvedStatus } from '@tuturuuu/utils/task-list-status';
import { type MouseEvent, memo } from 'react';
import { isOverdue } from '../../../utils/taskDateUtils';
import {
  getTaskCardCheckboxToneClasses,
  TASK_CARD_OVERDUE_CHECKBOX_TONE_CLASSES,
} from './task-card-checkbox-style';

interface TaskCardCheckboxProps {
  task: Task;
  taskList?: TaskList;
  isLoading: boolean;
  onToggle: (checked: boolean) => void;
  tooltipLabel: string;
}

export const TaskCardCheckbox = memo(function TaskCardCheckbox({
  task,
  taskList,
  isLoading,
  onToggle,
  tooltipLabel,
}: TaskCardCheckboxProps) {
  const taskIsOverdue = isOverdue(task.end_date);
  const isInResolvedList = isTaskBoardResolvedStatus(taskList?.status);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Checkbox
          aria-label={tooltipLabel}
          checked={!!task.closed_at}
          className={cn(
            'h-4 w-4 flex-none rounded-full transition-all duration-200',
            'data-[state=checked]:border-dynamic-green/70 data-[state=checked]:bg-dynamic-green/70',
            'hover:scale-110 hover:border-primary/50',
            getTaskCardCheckboxToneClasses(taskList?.color as SupportedColor),
            taskIsOverdue &&
              !task.closed_at &&
              !isInResolvedList &&
              TASK_CARD_OVERDUE_CHECKBOX_TONE_CLASSES
          )}
          disabled={isLoading}
          onCheckedChange={onToggle}
          onClick={(event: MouseEvent<HTMLButtonElement>) =>
            event.stopPropagation()
          }
        />
      </TooltipTrigger>
      <TooltipContent side="top">{tooltipLabel}</TooltipContent>
    </Tooltip>
  );
});
