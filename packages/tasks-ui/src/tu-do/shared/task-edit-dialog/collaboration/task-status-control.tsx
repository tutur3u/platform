'use client';

import type { TaskList } from '@tuturuuu/types/primitives/TaskList';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { getListStatusKey, groupListsByStatus } from './status';

interface TaskStatusControlProps {
  lists: TaskList[];
  currentListId?: string | null;
  disabled?: boolean;
  onSelectList: (listId: string) => void;
}

/**
 * Shows the task's list status (Backlog, Todo, In progress, Review, Done,
 * Cancelled) and lets people move it to any of the board's lists, grouped by
 * status under the board's own list names.
 */
export function TaskStatusControl({
  lists,
  currentListId,
  disabled = false,
  onSelectList,
}: TaskStatusControlProps) {
  const t = useTranslations('task-collaboration');
  const groups = groupListsByStatus(lists);
  const currentList = lists.find((list) => list.id === currentListId);
  const currentKey = currentList ? getListStatusKey(currentList) : null;
  const currentGroup = groups.find((group) => group.key === currentKey);
  const showListName = (currentGroup?.lists.length ?? 0) > 1;

  return (
    <Select
      disabled={disabled || groups.length === 0 || !currentKey}
      onValueChange={(listId) => {
        if (listId !== currentListId) onSelectList(listId);
      }}
      value={currentKey ? (currentListId ?? undefined) : undefined}
    >
      <SelectTrigger
        aria-label={t('status_label')}
        className="h-8 w-48 text-xs"
      >
        <span className="truncate">
          {currentKey
            ? showListName && currentList
              ? `${t(`status.${currentKey}`)} · ${currentList.name}`
              : t(`status.${currentKey}`)
            : t('status_label')}
        </span>
      </SelectTrigger>
      <SelectContent>
        {groups.map((group) => (
          <SelectGroup key={group.key}>
            <SelectLabel>{t(`status.${group.key}`)}</SelectLabel>
            {group.lists.map((list) => (
              <SelectItem key={list.id} value={list.id}>
                {list.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
