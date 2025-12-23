import { Calendar, X } from '@tuturuuu/icons';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  formatDistanceToNow,
  isToday,
  isTomorrow,
  isYesterday,
} from 'date-fns';
import { calculateDaysUntilEndOfWeek } from '../../../utils/weekDateUtils';

interface TaskDueDateMenuProps {
  endDate?: string | null;
  isLoading: boolean;
  weekStartsOn?: 0 | 1 | 6;
  onDueDateChange: (days: number | null) => void;
  onCustomDateClick: () => void;
  onMenuItemSelect: (e: Event, action: () => void) => void;
  onClose: () => void;
}

const formatSmartDate = (date: Date) => {
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  if (isYesterday(date)) return 'Yesterday';
  return formatDistanceToNow(date, { addSuffix: true });
};

const calculateDaysForPreset = (
  preset: 'today' | 'tomorrow' | 'this_week' | 'next_week',
  weekStartsOn: 0 | 1 | 6 = 0
) => {
  switch (preset) {
    case 'today':
      return 0;
    case 'tomorrow':
      return 1;
    case 'this_week': {
      // Days until end of week (respects first day of week setting)
      return calculateDaysUntilEndOfWeek(weekStartsOn);
    }
    case 'next_week': {
      // Days until end of next week
      return calculateDaysUntilEndOfWeek(weekStartsOn) + 7;
    }
  }
};

const dueDateOptions = [
  { preset: 'today' as const, label: 'Today', color: 'text-dynamic-green' },
  {
    preset: 'tomorrow' as const,
    label: 'Tomorrow',
    color: 'text-dynamic-blue',
  },
  {
    preset: 'this_week' as const,
    label: 'This Week',
    color: 'text-dynamic-purple',
  },
  {
    preset: 'next_week' as const,
    label: 'Next Week',
    color: 'text-dynamic-orange',
  },
];

export function TaskDueDateMenu({
  endDate,
  isLoading,
  weekStartsOn = 0,
  onDueDateChange,
  onCustomDateClick,
  onMenuItemSelect,
  onClose,
}: TaskDueDateMenuProps) {
  const currentDateDisplay = endDate
    ? formatSmartDate(new Date(endDate))
    : 'None';

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <div className="h-4 w-4">
          <Calendar className="h-4 w-4 text-dynamic-purple" />
        </div>
        <div className="flex w-full items-center justify-between">
          <span>Due Date</span>
          <span className="ml-auto text-muted-foreground text-xs">
            {currentDateDisplay}
          </span>
        </div>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {dueDateOptions.map((option) => (
          <DropdownMenuItem
            key={option.preset}
            onSelect={(e) =>
              onMenuItemSelect(e as unknown as Event, () => {
                onDueDateChange(
                  calculateDaysForPreset(option.preset, weekStartsOn)
                );
                onClose();
              })
            }
            className="cursor-pointer"
            disabled={isLoading}
          >
            <Calendar className={`h-4 w-4 ${option.color}`} />
            {option.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) =>
            onMenuItemSelect(e as unknown as Event, () => {
              onClose();
              setTimeout(() => onCustomDateClick(), 100);
            })
          }
          className="cursor-pointer"
          disabled={isLoading}
        >
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Custom Date
          </div>
        </DropdownMenuItem>
        {endDate && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) =>
                onMenuItemSelect(e as unknown as Event, () => {
                  onDueDateChange(null);
                  onClose();
                })
              }
              className="cursor-pointer text-muted-foreground"
              disabled={isLoading}
            >
              <X className="h-4 w-4" />
              Remove Due Date
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
