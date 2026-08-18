'use client';

import { Check, Plus } from '@tuturuuu/icons';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';
import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@tuturuuu/ui/command';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { EmptyStateCard } from '../../empty-state-card';
import { TaskCommandSearchInput } from '../../task-command-search-input';
import {
  type TaskListLabels,
  translateTaskListNameForDisplay,
} from '../../utils/translate-task-list-display-name';
import {
  taskListStatusIcon,
  taskListStatusToneClass,
} from './task-list-trigger-styles';

const statusOrder: TaskBoardStatus[] = [
  'documents',
  'not_started',
  'active',
  'review',
  'done',
  'closed',
];

/** Left accent bar + soft tinted surface (matches board column list styling, compact) */
export const taskListPickerRowColorClass: Record<SupportedColor, string> = {
  GRAY: 'border-l-[3px] border-l-dynamic-gray/70 border-y border-r border-border/45 bg-dynamic-gray/[0.07] hover:bg-dynamic-gray/[0.12]',
  RED: 'border-l-[3px] border-l-dynamic-red/70 border-y border-r border-border/45 bg-dynamic-red/[0.07] hover:bg-dynamic-red/[0.12]',
  BLUE: 'border-l-[3px] border-l-dynamic-blue/70 border-y border-r border-border/45 bg-dynamic-blue/[0.07] hover:bg-dynamic-blue/[0.12]',
  GREEN:
    'border-l-[3px] border-l-dynamic-green/70 border-y border-r border-border/45 bg-dynamic-green/[0.07] hover:bg-dynamic-green/[0.12]',
  YELLOW:
    'border-l-[3px] border-l-dynamic-yellow/70 border-y border-r border-border/45 bg-dynamic-yellow/[0.07] hover:bg-dynamic-yellow/[0.12]',
  ORANGE:
    'border-l-[3px] border-l-dynamic-orange/70 border-y border-r border-border/45 bg-dynamic-orange/[0.07] hover:bg-dynamic-orange/[0.12]',
  PURPLE:
    'border-l-[3px] border-l-dynamic-purple/70 border-y border-r border-border/45 bg-dynamic-purple/[0.07] hover:bg-dynamic-purple/[0.12]',
  PINK: 'border-l-[3px] border-l-dynamic-pink/70 border-y border-r border-border/45 bg-dynamic-pink/[0.07] hover:bg-dynamic-pink/[0.12]',
  INDIGO:
    'border-l-[3px] border-l-dynamic-indigo/70 border-y border-r border-border/45 bg-dynamic-indigo/[0.07] hover:bg-dynamic-indigo/[0.12]',
  CYAN: 'border-l-[3px] border-l-dynamic-cyan/70 border-y border-r border-border/45 bg-dynamic-cyan/[0.07] hover:bg-dynamic-cyan/[0.12]',
};

export interface TaskListPickerPanelProps {
  selectedListId: string;
  availableLists: TaskList[];
  disabled?: boolean;
  onSelectList: (listId: string) => void;
  /** Parent-controlled create-list dialog opener */
  onRequestOpenCreateDialog: () => void;
  className?: string;
}

export function TaskListPickerPanel({
  selectedListId,
  availableLists,
  disabled = false,
  onSelectList,
  onRequestOpenCreateDialog,
  className,
}: TaskListPickerPanelProps) {
  const t = useTranslations();
  const [searchQuery, setSearchQuery] = useState('');

  const statusLabels = useMemo(
    (): Record<TaskBoardStatus, string> => ({
      not_started: t('common.list_name_to_do'),
      active: t('common.list_name_in_progress'),
      review: t('common.list_name_review'),
      done: t('common.list_name_done'),
      closed: t('common.list_name_closed'),
      documents: t('common.documents'),
    }),
    [t]
  );

  const nameLabels = useMemo<TaskListLabels>(
    () => ({
      toDo: statusLabels.not_started,
      inProgress: statusLabels.active,
      review: statusLabels.review,
      done: statusLabels.done,
      closed: statusLabels.closed,
      documents: statusLabels.documents,
    }),
    [statusLabels]
  );

  const groupedLists = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();

    return statusOrder
      .map((status) => {
        const lists = availableLists
          .filter((list) => list.status === status)
          .filter((list) => {
            if (!normalizedQuery) return true;
            return translateTaskListNameForDisplay(list.name, nameLabels)
              .toLocaleLowerCase()
              .includes(normalizedQuery);
          })
          .sort((a, b) => {
            const positionDiff = (a.position ?? 0) - (b.position ?? 0);
            if (positionDiff !== 0) return positionDiff;
            return a.name.localeCompare(b.name);
          });
        return { status, lists };
      })
      .filter((group) => group.lists.length > 0);
  }, [availableLists, nameLabels, searchQuery]);

  const addNewListLabel = t('ws-task-boards.layout_settings.add_new_list');
  const openCreateDialog = () => {
    if (!disabled) onRequestOpenCreateDialog();
  };

  if (availableLists.length === 0) {
    return (
      <div className={cn('w-full min-w-0 p-0', className)}>
        <EmptyStateCard
          title={t('ws-task-boards.dialog.no_lists_found')}
          description={t('ws-task-boards.select_or_create_list')}
          actionLabel={addNewListLabel}
          ActionIcon={Plus}
          onAction={openCreateDialog}
        />
      </div>
    );
  }

  return (
    <Command
      shouldFilter={false}
      className={cn('w-full min-w-0 rounded-none border-0', className)}
    >
      <TaskCommandSearchInput
        value={searchQuery}
        onValueChange={setSearchQuery}
        placeholder={`${t('common.search')}...`}
        className="h-9"
      />
      <CommandList className="max-h-80">
        {groupedLists.length === 0 && (
          <div className="py-6 text-center text-muted-foreground text-xs">
            {t('ws-task-boards.dialog.no_lists_found')}
          </div>
        )}
        {groupedLists.map((group, index) => {
          const StatusIcon = taskListStatusIcon[group.status];

          return (
            <CommandGroup
              key={group.status}
              className={cn(index > 0 && 'border-t')}
              heading={
                <div className="flex items-center gap-1.5">
                  <StatusIcon
                    className={cn(
                      'h-3.5 w-3.5',
                      taskListStatusToneClass[group.status]
                    )}
                  />
                  <span>{statusLabels[group.status]}</span>
                  <span className="font-normal opacity-70">
                    ({group.lists.length})
                  </span>
                </div>
              }
            >
              {group.lists.map((list) => {
                const isSelected = selectedListId === list.id;
                const colorKey = list.color ?? 'GRAY';
                const rowTint =
                  taskListPickerRowColorClass[colorKey] ??
                  taskListPickerRowColorClass.GRAY;
                const displayName = translateTaskListNameForDisplay(
                  list.name,
                  nameLabels
                );

                return (
                  <CommandItem
                    key={list.id}
                    value={`${displayName} ${list.id}`}
                    disabled={disabled}
                    onSelect={() => onSelectList(list.id)}
                    aria-current={isSelected ? 'true' : undefined}
                    className={cn(
                      'mb-1 flex w-full cursor-pointer items-center gap-2.5 rounded-lg py-2 pr-2.5 pl-2.5 text-left text-sm shadow-sm transition-colors',
                      rowTint,
                      isSelected &&
                        'bg-primary/[0.07] ring-1 ring-primary/35 ring-inset hover:bg-primary/10',
                      disabled && 'pointer-events-none opacity-50'
                    )}
                  >
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-foreground',
                        isSelected ? 'font-semibold' : 'font-medium'
                      )}
                    >
                      {displayName}
                    </span>
                    {isSelected && (
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          );
        })}
        <CommandSeparator />
        <CommandGroup>
          <CommandItem
            value={addNewListLabel}
            className="cursor-pointer text-muted-foreground"
            disabled={disabled}
            onSelect={openCreateDialog}
          >
            <Plus className="h-3.5 w-3.5" />
            {addNewListLabel}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
