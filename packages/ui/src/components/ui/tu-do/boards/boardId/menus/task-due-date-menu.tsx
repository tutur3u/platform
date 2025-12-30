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
  translations?: {
    dueDate?: string;
    none?: string;
    today?: string;
    tomorrow?: string;
    yesterday?: string;
    thisWeek?: string;
    nextWeek?: string;
    customDate?: string;
    removeDueDate?: string;
  };
}

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

export function TaskDueDateMenu({
  endDate,
  isLoading,
  weekStartsOn = 0,
  onDueDateChange,
  onCustomDateClick,
  onMenuItemSelect,
  onClose,
  translations,
}: TaskDueDateMenuProps) {
  // Use provided translations or fall back to English defaults
  const t = {
    dueDate: translations?.dueDate ?? 'Due Date',
    none: translations?.none ?? 'None',
    today: translations?.today ?? 'Today',
    tomorrow: translations?.tomorrow ?? 'Tomorrow',
    yesterday: translations?.yesterday ?? 'Yesterday',
    thisWeek: translations?.thisWeek ?? 'This Week',
    nextWeek: translations?.nextWeek ?? 'Next Week',
    customDate: translations?.customDate ?? 'Custom Date',
    removeDueDate: translations?.removeDueDate ?? 'Remove Due Date',
  };

  const formatSmartDateTranslated = (date: Date) => {
    if (isToday(date)) return t.today;
    if (isTomorrow(date)) return t.tomorrow;
    if (isYesterday(date)) return t.yesterday;
    return formatDistanceToNow(date, { addSuffix: true });
  };

  const dueDateOptionsTranslated = [
    { preset: 'today' as const, label: t.today, color: 'text-dynamic-green' },
    {
      preset: 'tomorrow' as const,
      label: t.tomorrow,
      color: 'text-dynamic-blue',
    },
    {
      preset: 'this_week' as const,
      label: t.thisWeek,
      color: 'text-dynamic-purple',
    },
    {
      preset: 'next_week' as const,
      label: t.nextWeek,
      color: 'text-dynamic-orange',
    },
  ];

  const currentDateDisplay = endDate
    ? formatSmartDateTranslated(new Date(endDate))
    : t.none;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <div className="h-4 w-4">
          <Calendar className="h-4 w-4 text-dynamic-purple" />
        </div>
        <div className="flex w-full items-center justify-between">
          <span>{t.dueDate}</span>
          <span className="ml-auto text-muted-foreground text-xs">
            {currentDateDisplay}
          </span>
        </div>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {dueDateOptionsTranslated.map((option) => (
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
            {t.customDate}
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
              {t.removeDueDate}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
