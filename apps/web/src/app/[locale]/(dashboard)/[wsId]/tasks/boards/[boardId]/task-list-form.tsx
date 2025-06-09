import { createClient } from '@tuturuuu/supabase/next/client';
import { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { TaskBoardStatus } from '@tuturuuu/types/primitives/TaskBoard';
import { Button } from '@tuturuuu/ui/button';
import { Plus } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { useState } from 'react';

interface Props {
  boardId: string;
  defaultStatus?: TaskBoardStatus;
  inline?: boolean;
  onListCreated?: () => void;
  onCancel?: () => void;
}

export function TaskListForm({
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

    const supabase = createClient();

    // Create list with enhanced API that supports status and color
    const { error } = await supabase
      .from('task_lists')
      .insert({
        board_id: boardId,
        name: name.trim(),
        status: defaultStatus,
        color: getDefaultColorForStatus(defaultStatus),
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating task list:', error);
      return;
    }

    setName('');
    setIsAdding(false);
    onListCreated?.();
  }

  function getDefaultColorForStatus(status: TaskBoardStatus): SupportedColor {
    switch (status) {
      case 'not_started':
        return 'GRAY';
      case 'active':
        return 'BLUE';
      case 'done':
        return 'GREEN';
      case 'closed':
        return 'PURPLE';
      default:
        return 'GRAY';
    }
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

  // Legacy mode - show add button first
  return (
    <Button
      variant="outline"
      className="flex h-3/4 w-[350px] items-center gap-2 border-dashed"
      onClick={() => setIsAdding(true)}
    >
      <Plus className="h-4 w-4" />
      Add new list
    </Button>
  );
}
