import { createTaskList } from '@/lib/task-helper';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Plus } from 'lucide-react';
import { useState } from 'react';

interface Props {
  boardId: string;
  onListCreated?: () => void;
}

export function TaskListForm({ boardId, onListCreated }: Props) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    const supabase = createClient();
    await createTaskList(supabase, boardId, name);

    setName('');
    setIsAdding(false);
    onListCreated?.();
  }

  if (!isAdding) {
    return (
      <Button
        variant="outline"
        className="flex h-full w-[350px] items-center gap-2 border-dashed"
        onClick={() => setIsAdding(true)}
      >
        <Plus className="h-4 w-4" />
        Add new list
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex h-min w-[350px] flex-col gap-2 rounded-lg border bg-card p-3 text-card-foreground"
    >
      <Input
        placeholder="List name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm">
          Add list
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setIsAdding(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
