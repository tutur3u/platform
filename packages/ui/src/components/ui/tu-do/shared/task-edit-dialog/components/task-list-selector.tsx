'use client';

import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { translateTaskListNameForDisplay } from '../../utils/translate-task-list-display-name';
import { TaskListPickerPanel } from './task-list-picker-panel';
import {
  getTaskListTriggerIcon,
  getTaskListTriggerSurfaceClass,
} from './task-list-trigger-styles';

interface TaskListSelectorProps {
  wsId: string;
  boardId: string;
  selectedListId: string;
  availableLists: TaskList[];
  disabled?: boolean;
  onListChange: (listId: string) => void;
}

export function TaskListSelector({
  wsId,
  boardId,
  selectedListId,
  availableLists,
  disabled = false,
  onListChange,
}: TaskListSelectorProps) {
  const t = useTranslations();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const statusLabels = useMemo(
    () => ({
      not_started: t('common.list_name_to_do'),
      active: t('common.list_name_in_progress'),
      done: t('common.list_name_done'),
      closed: t('common.list_name_closed'),
      documents: t('common.documents'),
    }),
    [t]
  );

  const nameLabels = useMemo(
    () => ({
      toDo: statusLabels.not_started,
      inProgress: statusLabels.active,
      done: statusLabels.done,
      closed: statusLabels.closed,
      documents: statusLabels.documents,
    }),
    [statusLabels]
  );

  const selectedList = useMemo(
    () => availableLists.find((list) => list.id === selectedListId),
    [availableLists, selectedListId]
  );

  const TriggerIcon = getTaskListTriggerIcon(selectedList);
  const triggerSurfaceClass = getTaskListTriggerSurfaceClass(selectedList);

  return (
    <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 font-medium text-xs transition-colors',
            selectedList && triggerSurfaceClass
              ? triggerSurfaceClass
              : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-muted hover:text-foreground',
            disabled && 'cursor-not-allowed opacity-50'
          )}
        >
          <TriggerIcon className="h-3.5 w-3.5 shrink-0" />
          <span>
            {selectedList
              ? translateTaskListNameForDisplay(selectedList.name, nameLabels)
              : t('ws-task-boards.dialog.field.list')}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <TaskListPickerPanel
          wsId={wsId}
          boardId={boardId}
          selectedListId={selectedListId}
          availableLists={availableLists}
          disabled={disabled}
          onSelectList={(listId) => {
            onListChange(listId);
            setIsPopoverOpen(false);
          }}
          onBeforeOpenCreateDialog={() => setIsPopoverOpen(false)}
          className="w-full"
        />
      </PopoverContent>
    </Popover>
  );
}
