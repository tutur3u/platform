'use client';

import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { CreateListDialog } from '../../../create-list-dialog';
import { translateTaskListNameForDisplay } from '../../../utils/translate-task-list-display-name';
import { TaskListPickerPanel } from '../task-list-picker-panel';
import { getTaskListTriggerIcon } from '../task-list-trigger-styles';
import { QuickCreateChip } from './quick-create-chip';

interface QuickCreateListChipProps {
  wsId: string;
  boardId: string;
  selectedListId: string;
  availableLists: TaskList[];
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onListChange: (listId: string) => void;
}

/** The List chip, reusing the board's list picker and create-list dialog. */
export function QuickCreateListChip({
  wsId,
  boardId,
  selectedListId,
  availableLists,
  disabled,
  open,
  onOpenChange,
  onListChange,
}: QuickCreateListChipProps) {
  const t = useTranslations();
  const [createListOpen, setCreateListOpen] = useState(false);
  const selectedList = availableLists.find(
    (list) => list.id === selectedListId
  );
  const value = selectedList
    ? translateTaskListNameForDisplay(selectedList.name, {
        toDo: t('common.list_name_to_do'),
        inProgress: t('common.list_name_in_progress'),
        review: t('common.list_name_review'),
        done: t('common.list_name_done'),
        closed: t('common.list_name_closed'),
        documents: t('common.documents'),
      })
    : null;

  return (
    <>
      <QuickCreateChip
        id="list"
        icon={getTaskListTriggerIcon(selectedList)}
        label={t('ws-task-boards.dialog.quick_create.list')}
        value={value}
        emptyValue={t('ws-task-boards.dialog.quick_create.none')}
        open={open}
        disabled={disabled}
        contentClassName="w-80"
        onOpenChange={onOpenChange}
      >
        <TaskListPickerPanel
          selectedListId={selectedListId}
          availableLists={availableLists}
          disabled={disabled}
          enableNumericShortcuts
          onSelectList={(listId) => {
            onListChange(listId);
            onOpenChange(false);
          }}
          onRequestOpenCreateDialog={() => {
            onOpenChange(false);
            setCreateListOpen(true);
          }}
        />
      </QuickCreateChip>
      <CreateListDialog
        open={createListOpen}
        onOpenChange={setCreateListOpen}
        boardId={boardId}
        wsId={wsId}
        initialStatus="active"
        onSuccess={onListChange}
        translations={{
          listNameAlreadyExists: t(
            'ws-task-boards.layout_settings.list_name_exists'
          ),
        }}
      />
    </>
  );
}
