import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import { Check, Flag, horseHead, Icon, Rabbit, Turtle, unicornHead, X } from '@tuturuuu/ui/icons';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';

interface TaskPriorityMenuProps {
  currentPriority: TaskPriority | null;
  isLoading: boolean;
  onPriorityChange: (priority: TaskPriority | null) => void;
  onMenuItemSelect: (e: Event, action: () => void) => void;
  onClose: () => void;
}

const priorityOptions: Array<{
  value: TaskPriority;
  label: string;
  icon: typeof Icon;
  iconProps?: any;
  className: string;
}> = [
  {
    value: 'critical',
    label: 'Urgent',
    icon: Icon,
    iconProps: { iconNode: unicornHead },
    className: 'bg-dynamic-red/10 text-dynamic-red',
  },
  {
    value: 'high',
    label: 'High',
    icon: Icon,
    iconProps: { iconNode: horseHead },
    className: 'bg-dynamic-orange/10 text-dynamic-orange',
  },
  {
    value: 'normal',
    label: 'Medium',
    icon: Rabbit,
    className: 'bg-dynamic-yellow/10 text-dynamic-yellow',
  },
  {
    value: 'low',
    label: 'Low',
    icon: Turtle,
    className: 'bg-dynamic-blue/10 text-dynamic-blue',
  },
];

const priorityIconColor: Record<TaskPriority, string> = {
  critical: 'text-dynamic-red',
  high: 'text-dynamic-orange',
  normal: 'text-dynamic-yellow',
  low: 'text-dynamic-blue',
};

const priorityLabel: Record<TaskPriority, string> = {
  critical: 'Urgent',
  high: 'High',
  normal: 'Medium',
  low: 'Low',
};

export function TaskPriorityMenu({
  currentPriority,
  isLoading,
  onPriorityChange,
  onMenuItemSelect,
  onClose,
}: TaskPriorityMenuProps) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <div className="h-4 w-4">
          <Flag className="h-4 w-4 text-dynamic-orange" />
        </div>
        <div className="flex w-full items-center justify-between">
          <span>Priority</span>
          <span className="ml-auto text-muted-foreground text-xs">
            {currentPriority ? priorityLabel[currentPriority] : 'None'}
          </span>
        </div>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuItem
          onSelect={(e) =>
            onMenuItemSelect(e as unknown as Event, () => {
              onPriorityChange(null);
              onClose();
            })
          }
          className={cn(
            'cursor-pointer text-muted-foreground',
            !currentPriority && 'bg-muted/50'
          )}
          disabled={isLoading}
        >
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-2">
              <X className="h-4 w-4" />
              None
            </div>
            {!currentPriority && <Check className="h-4 w-4" />}
          </div>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {priorityOptions.map((option) => {
          const IconComponent = option.icon;
          const isActive = currentPriority === option.value;
          const iconColor = priorityIconColor[option.value];

          return (
            <DropdownMenuItem
              key={option.value}
              onSelect={(e) =>
                onMenuItemSelect(e as unknown as Event, () => {
                  onPriorityChange(option.value);
                  onClose();
                })
              }
              className={cn(
                'cursor-pointer',
                isActive && option.className
              )}
              disabled={isLoading}
            >
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-2">
                  <IconComponent
                    className={cn('h-4 w-4', iconColor)}
                    {...option.iconProps}
                  />
                  {option.label}
                </div>
                {isActive && <Check className={cn('h-4 w-4', iconColor)} />}
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
