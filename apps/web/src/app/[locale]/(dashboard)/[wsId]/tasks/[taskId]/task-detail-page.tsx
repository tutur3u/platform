'use client';

import type { Task } from '@tuturuuu/types/primitives/Task';
import { TaskEditDialog } from '@tuturuuu/ui/tu-do/shared/task-edit-dialog';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface TaskDetailPageProps {
  task: Task;
  boardId: string;
  boardName?: string;
  listName?: string;
  wsId: string;
}

export default function TaskDetailPage({
  task,
  boardId,
  wsId,
}: TaskDetailPageProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);

  // Navigate back when dialog closes
  useEffect(() => {
    if (!isOpen) {
      router.push(`/${wsId}/tasks/boards/${boardId}`);
    }
  }, [isOpen, router, wsId, boardId]);

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleUpdate = () => {
    // Task was updated, we can stay on this page
    // The page will show the updated data on next navigation
  };

  return (
    <div className="flex h-full w-full items-center justify-center">
      <TaskEditDialog
        task={task}
        boardId={boardId}
        isOpen={isOpen}
        onClose={handleClose}
        onUpdate={handleUpdate}
        mode="edit"
      />
    </div>
  );
}
