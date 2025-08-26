import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useId, useState } from 'react';

interface Props {
  listId: string;
  onTaskCreated?: () => void;
  onCancel?: () => void;
}

export function TaskForm({ listId, onTaskCreated, onCancel }: Props) {
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Generate unique IDs for form elements
  const nameId = useId();
  const descriptionId = useId();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    const supabase = createClient();
    const { error } = await supabase.from('tasks').insert({
      name: name.trim(),
      description: description.trim(),
      list_id: listId,
    });

    if (!error) {
      setName('');
      setDescription('');
      setIsAdding(false);
      onTaskCreated?.();
    }
  }

  if (!isAdding) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsAdding(true)}
        className="w-full justify-start text-muted-foreground hover:text-foreground"
      >
        + Add task
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Input
        placeholder="Task name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
        id={nameId}
      />
      <Textarea
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={2}
        id={descriptionId}
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!name.trim()}>
          Add Task
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setIsAdding(false);
            setName('');
            setDescription('');
            onCancel?.();
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
