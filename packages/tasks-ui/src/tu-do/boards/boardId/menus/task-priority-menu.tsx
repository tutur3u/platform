import {
  Check,
  Flag,
  horseHead,
  Icon,
  Rabbit,
  Turtle,
  unicornHead,
  X,
} from '@tuturuuu/icons';
import type { TaskPriority } from '@tuturuuu/types/primitives/Priority';
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  clearTaskCommandSearchOnEscape,
  TaskCommandSearchInput,
} from '../../../shared/task-command-search-input';

interface TaskPriorityMenuProps {
  currentPriority: TaskPriority | null;
  isLoading: boolean;
  onPriorityChange: (priority: TaskPriority | null) => void;
  onMenuItemSelect: (e: Event, action: () => void) => void;
  onClose: () => void;
  translations?: {
    priority?: string;
    none?: string;
    urgent?: string;
    high?: string;
    medium?: string;
    low?: string;
  };
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

export function TaskPriorityMenu({
  currentPriority,
  isLoading,
  onPriorityChange,
  onMenuItemSelect,
  onClose,
  translations,
}: TaskPriorityMenuProps) {
  const commonT = useTranslations('common');
  const [searchQuery, setSearchQuery] = useState('');
  // Use provided translations or fall back to English defaults
  const t = {
    priority: translations?.priority ?? 'Priority',
    none: translations?.none ?? 'None',
    urgent: translations?.urgent ?? 'Urgent',
    high: translations?.high ?? 'High',
    medium: translations?.medium ?? 'Medium',
    low: translations?.low ?? 'Low',
  };

  // Translated priority labels
  const priorityLabelTranslated: Record<TaskPriority, string> = {
    critical: t.urgent,
    high: t.high,
    normal: t.medium,
    low: t.low,
  };
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredOptions = priorityOptions.filter((option) =>
    `${priorityLabelTranslated[option.value]} ${option.value}`
      .toLocaleLowerCase()
      .includes(normalizedQuery)
  );
  const showNone = t.none.toLocaleLowerCase().includes(normalizedQuery);
  const select = (action: () => void) =>
    onMenuItemSelect(
      { preventDefault: () => undefined } as unknown as Event,
      action
    );

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="min-w-0">
        <div className="h-4 w-4 shrink-0">
          <Flag className="h-4 w-4 text-dynamic-orange" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="min-w-0 flex-1 truncate whitespace-nowrap">
            {t.priority}
          </span>
          <span className="max-w-20 shrink-0 truncate whitespace-nowrap text-right text-muted-foreground text-xs">
            {currentPriority
              ? priorityLabelTranslated[currentPriority]
              : t.none}
          </span>
        </div>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        className="w-56 p-0"
        onEscapeKeyDown={(event) =>
          clearTaskCommandSearchOnEscape(event, searchQuery, setSearchQuery)
        }
      >
        <Command shouldFilter={false} className="rounded-none border-0">
          <TaskCommandSearchInput
            value={searchQuery}
            onValueChange={setSearchQuery}
            placeholder={`${commonT('search')}...`}
            className="h-9"
          />
          <CommandList className="max-h-64">
            {!showNone && filteredOptions.length === 0 ? (
              <div className="px-3 py-6 text-center text-muted-foreground text-xs">
                {commonT('no-results')}
              </div>
            ) : (
              <CommandGroup>
                {showNone && (
                  <CommandItem
                    value={`none ${t.none}`}
                    onSelect={() =>
                      select(() => {
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
                    <X className="h-4 w-4" />
                    <span className="min-w-0 flex-1 truncate">{t.none}</span>
                    {!currentPriority && <Check className="h-4 w-4" />}
                  </CommandItem>
                )}
                {filteredOptions.map((option) => {
                  const IconComponent = option.icon;
                  const isActive = currentPriority === option.value;
                  const iconColor = priorityIconColor[option.value];

                  return (
                    <CommandItem
                      key={option.value}
                      value={`${priorityLabelTranslated[option.value]} ${option.value}`}
                      onSelect={() =>
                        select(() => {
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
                      <IconComponent
                        className={cn('h-4 w-4', iconColor)}
                        {...option.iconProps}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {priorityLabelTranslated[option.value]}
                      </span>
                      {isActive && (
                        <Check className={cn('h-4 w-4', iconColor)} />
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
