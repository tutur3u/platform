'use client';

import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { CreateListDialog } from '../../create-list-dialog';
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
  compact?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onListChange: (listId: string) => void;
}

export function TaskListSelector({
  wsId,
  boardId,
  selectedListId,
  availableLists,
  disabled = false,
  compact = false,
  open,
  onOpenChange,
  onListChange,
}: TaskListSelectorProps) {
  const t = useTranslations();
  const [uncontrolledPopoverOpen, setUncontrolledPopoverOpen] = useState(false);
  const [isCreateListDialogOpen, setIsCreateListDialogOpen] = useState(false);
  const isPopoverOpen = open ?? uncontrolledPopoverOpen;
  const setIsPopoverOpen = onOpenChange ?? setUncontrolledPopoverOpen;

  const statusLabels = useMemo(
    () => ({
      not_started: t('common.list_name_to_do'),
      active: t('common.list_name_in_progress'),
      review: t('common.list_name_review'),
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
      review: statusLabels.review,
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
  const triggerLabel = selectedList
    ? translateTaskListNameForDisplay(selectedList.name, nameLabels)
    : t('ws-task-boards.dialog.field.list');
  const triggerButton = (
    <button
      type="button"
      disabled={disabled}
      aria-label={compact ? triggerLabel : undefined}
      className={cn(
        'inline-flex shrink-0 items-center border font-medium text-xs transition-colors',
        compact
          ? 'h-9 w-9 justify-center rounded-md p-0'
          : 'h-8 gap-1.5 rounded-lg px-3',
        selectedList && triggerSurfaceClass
          ? triggerSurfaceClass
          : 'border-border bg-background text-muted-foreground hover:border-primary/30 hover:bg-muted hover:text-foreground',
        disabled && 'cursor-not-allowed opacity-50'
      )}
    >
      <TriggerIcon className="h-3.5 w-3.5 shrink-0" />
      <span className={compact ? 'sr-only' : undefined}>{triggerLabel}</span>
    </button>
  );

  return (
    <>
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        {compact ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">{triggerLabel}</TooltipContent>
          </Tooltip>
        ) : (
          <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
        )}
        <PopoverContent align="start" className="w-80 p-0">
          <TaskListPickerPanel
            selectedListId={selectedListId}
            availableLists={availableLists}
            disabled={disabled}
            onSelectList={(listId) => {
              onListChange(listId);
              setIsPopoverOpen(false);
            }}
            onRequestOpenCreateDialog={() => {
              setIsPopoverOpen(false);
              setIsCreateListDialogOpen(true);
            }}
            className="w-full"
          />
        </PopoverContent>
      </Popover>

      <CreateListDialog
        open={isCreateListDialogOpen}
        onOpenChange={setIsCreateListDialogOpen}
        boardId={boardId}
        wsId={wsId}
        initialStatus="active"
        onSuccess={(listId) => {
          onListChange(listId);
        }}
        translations={{
          listNameAlreadyExists: t(
            'ws-task-boards.layout_settings.list_name_exists'
          ),
        }}
      />
    </>
  );
}
