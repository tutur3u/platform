import { Calendar, X } from '@tuturuuu/ui/icons';
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

interface TaskDueDateMenuProps {
  endDate?: string | null;
  isLoading: boolean;
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

const dueDateOptions = [
  { days: 0, label: 'Today', color: 'text-dynamic-green' },
  { days: 1, label: 'Tomorrow', color: 'text-dynamic-blue' },
  { days: 7, label: 'Next Week', color: 'text-dynamic-purple' },
  { days: 30, label: 'Next Month', color: 'text-dynamic-orange' },
];

export function TaskDueDateMenu({
  endDate,
  isLoading,
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
            key={option.days}
            onSelect={(e) =>
              onMenuItemSelect(e as unknown as Event, () => {
                onDueDateChange(option.days);
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
