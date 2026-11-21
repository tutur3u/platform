import { createWorkspaceTaskList } from '@tuturuuu/internal-api';
import type { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { getDefaultTaskListColorForStatus } from '@tuturuuu/utils/task-list-status';
import { useState } from 'react';

interface Props {
  wsId: string;
  boardId: string;
  defaultStatus?: TaskBoardStatus;
  inline?: boolean;
  onListCreated?: () => void;
  onCancel?: () => void;
}

export function TaskListForm({
  wsId,
  boardId,
  defaultStatus = 'not_started',
  inline = false,
  onListCreated,
  onCancel,
}: Props) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      await createWorkspaceTaskList(wsId, boardId, {
        name: name.trim(),
        status: defaultStatus,
        color: getDefaultTaskListColorForStatus(defaultStatus),
      });
    } catch (error) {
      console.error('Error creating task list:', error);
      return;
    }

    setName('');
    setIsAdding(false);
    onListCreated?.();
  }

  function handleCancel() {
    setName('');
    setIsAdding(false);
    onCancel?.();
  }

  // If in inline mode, always show the form
  if (inline || isAdding) {
    return (
      <form
        onSubmit={handleSubmit}
        className="flex h-min w-full flex-col gap-2 rounded-lg border bg-card p-3 text-card-foreground shadow-sm"
      >
        <Input
          placeholder="List name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="text-sm"
        />
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" disabled={!name.trim()}>
            Add list
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCancel}
          >
            Cancel
          </Button>
        </div>
      </form>
    );
  }

  return null;
}
