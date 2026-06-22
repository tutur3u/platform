'use client';

import { Loader2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';

type WorkspaceOption = { id: string; name: string | null };
type BoardOption = {
  id: string;
  name: string | null;
  task_lists?: Array<{ id: string; name: string | null }>;
};

interface PlannerTargetControlsProps {
  addWorkspacePending: boolean;
  boards: BoardOption[];
  createItemPending: boolean;
  lists: Array<{ id: string; name: string | null }>;
  onAddWorkspace: () => void;
  onCreateItem: () => void;
  onPlannedDateChange: (value: string) => void;
  onTargetBoardChange: (value: string) => void;
  onTargetListChange: (value: string) => void;
  onTargetWorkspaceChange: (value: string) => void;
  onTaskTitleChange: (value: string) => void;
  plannedDate: string;
  targetBoardId: string;
  targetIsIntended: boolean;
  targetListId: string;
  targetWorkspaceId: string;
  taskTitle: string;
  workspaces: WorkspaceOption[];
}

export function PlannerTargetControls({
  addWorkspacePending,
  boards,
  createItemPending,
  lists,
  onAddWorkspace,
  onCreateItem,
  onPlannedDateChange,
  onTargetBoardChange,
  onTargetListChange,
  onTargetWorkspaceChange,
  onTaskTitleChange,
  plannedDate,
  targetBoardId,
  targetIsIntended,
  targetListId,
  targetWorkspaceId,
  taskTitle,
  workspaces,
}: PlannerTargetControlsProps) {
  const t = useTranslations('ws-task-plans');

  return (
    <div className="mt-2 grid gap-2 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
        <Select
          value={targetWorkspaceId}
          onValueChange={onTargetWorkspaceChange}
        >
          <SelectTrigger className="h-9">
            <SelectValue placeholder={t('target_workspace')} />
          </SelectTrigger>
          <SelectContent>
            {workspaces.map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id}>
                {workspace.name ?? t('untitled_workspace')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={targetBoardId} onValueChange={onTargetBoardChange}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder={t('target_board')} />
          </SelectTrigger>
          <SelectContent>
            {boards.map((board) => (
              <SelectItem key={board.id} value={board.id}>
                {board.name ?? t('untitled_board')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={targetListId} onValueChange={onTargetListChange}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder={t('target_list')} />
          </SelectTrigger>
          <SelectContent>
            {lists.map((list) => (
              <SelectItem key={list.id} value={list.id}>
                {list.name ?? t('target_list')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant={targetIsIntended ? 'secondary' : 'outline'}
          size="sm"
          onClick={onAddWorkspace}
          disabled={targetIsIntended || addWorkspacePending}
          className="h-9"
        >
          {targetIsIntended ? t('intended_workspace') : t('add_workspace')}
        </Button>
      </div>

      <div className="grid gap-2 md:grid-cols-[9rem_1fr_auto] xl:grid-cols-[8rem_1fr_auto]">
        <Input
          type="date"
          value={plannedDate}
          onChange={(event) => onPlannedDateChange(event.target.value)}
          className="h-9"
          aria-label={t('planned_date')}
        />
        <Input
          value={taskTitle}
          onChange={(event) => onTaskTitleChange(event.target.value)}
          placeholder={t('task_title_placeholder')}
          className="h-9"
        />
        <Button
          type="button"
          size="sm"
          onClick={onCreateItem}
          disabled={!taskTitle.trim() || createItemPending}
          className="h-9 gap-2"
        >
          {createItemPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {targetIsIntended && targetListId
            ? t('create_task')
            : t('create_draft')}
        </Button>
      </div>
    </div>
  );
}
