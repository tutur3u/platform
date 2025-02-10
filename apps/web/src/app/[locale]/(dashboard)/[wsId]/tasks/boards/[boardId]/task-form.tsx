import { createTask } from '@/lib/task-helper';
import { createClient } from '@tutur3u/supabase/next/client';
import { Button } from '@tutur3u/ui/components/ui/button';
import { Input } from '@tutur3u/ui/components/ui/input';
import { Plus } from 'lucide-react';
import { useState } from 'react';

interface Props {
  listId: string;
  onTaskCreated: () => void;
}

export function TaskForm({ listId, onTaskCreated }: Props) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    const supabase = createClient();
    await createTask(supabase, listId, { name });

    setName('');
    setIsAdding(false);
    onTaskCreated();
  }

  if (!isAdding) {
    return (
      <Button
        variant="ghost"
        className="flex w-full items-center justify-start gap-2"
        onClick={() => setIsAdding(true)}
      >
        <Plus className="h-4 w-4" />
        Add new task
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Input
        placeholder="Task name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm">
          Add task
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
