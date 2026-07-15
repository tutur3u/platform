import { Calendar, X } from '@tuturuuu/icons';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import {
  differenceInCalendarDays,
  isToday,
  isTomorrow,
  isValid,
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

const formatCompactRelativeDate = (date: Date, now = new Date()) => {
  const days = differenceInCalendarDays(date, now);
  const absoluteDays = Math.abs(days);

  const [value, unit] =
    absoluteDays < 7
      ? [absoluteDays, 'd']
      : absoluteDays < 30
        ? [Math.max(1, Math.round(absoluteDays / 7)), 'wk']
        : absoluteDays < 365
          ? [Math.max(1, Math.round(absoluteDays / 30)), 'mo']
          : [Math.max(1, Math.round(absoluteDays / 365)), 'y'];

  return days > 0 ? `in ${value}${unit}` : `${value}${unit} ago`;
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
    return formatCompactRelativeDate(date);
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

  const parsedEndDate = endDate ? new Date(endDate) : null;
  const currentDateDisplay =
    parsedEndDate && isValid(parsedEndDate)
      ? formatSmartDateTranslated(parsedEndDate)
      : t.none;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="min-w-0">
        <div className="h-4 w-4 shrink-0">
          <Calendar className="h-4 w-4 text-dynamic-purple" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 flex-1 truncate whitespace-nowrap">
            {t.dueDate}
          </span>
          <span className="max-w-20 shrink-0 truncate whitespace-nowrap text-right text-muted-foreground text-xs">
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
