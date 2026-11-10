'use client';

import { useQuery } from '@tanstack/react-query';
import {
  createWorkspaceTask,
  listWorkspaceBoardsWithLists,
} from '@tuturuuu/internal-api/tasks';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function NoteTaskConversionDialog({
  wsId,
  name,
  open,
  onOpenChange,
  onCreated,
}: {
  wsId: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const t = useTranslations('notes_app');
  const [boardId, setBoardId] = useState<string | null>(null);
  const [listId, setListId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(false);
  const boards = useQuery({
    queryKey: ['notes', wsId, 'task-destinations'],
    queryFn: () => listWorkspaceBoardsWithLists(wsId),
    enabled: open,
  });
  const selectedBoard = boards.data?.boards.find(
    (board) => board.id === boardId
  );

  const create = async () => {
    if (!listId || creating) return;
    setCreating(true);
    setError(false);
    try {
      const result = await createWorkspaceTask(wsId, { name, listId });
      const id = result.task?.id;
      if (!id) throw new Error('Missing task ID');
      onCreated(id);
      onOpenChange(false);
    } catch {
      setError(true);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('convert_to_task')}</DialogTitle>
        </DialogHeader>
        <p className="line-clamp-2 text-muted-foreground text-sm">{name}</p>
        {boards.isPending ? (
          <p className="py-4 text-muted-foreground text-sm">{t('loading')}</p>
        ) : boards.isError ? (
          <p className="py-4 text-destructive text-sm">
            {t('task_load_error')}
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="mb-2 font-medium text-sm">{t('task_board')}</p>
              <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
                {boards.data.boards.length === 0 && (
                  <p className="text-muted-foreground text-sm">
                    {t('task_no_boards')}
                  </p>
                )}
                {boards.data.boards.map((board) => (
                  <Button
                    key={board.id}
                    type="button"
                    size="sm"
                    variant={boardId === board.id ? 'default' : 'outline'}
                    onClick={() => {
                      setBoardId(board.id);
                      setListId(null);
                    }}
                  >
                    {board.name}
                  </Button>
                ))}
              </div>
            </div>
            {selectedBoard && (
              <div>
                <p className="mb-2 font-medium text-sm">{t('task_list')}</p>
                <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
                  {selectedBoard.task_lists.length === 0 && (
                    <p className="text-muted-foreground text-sm">
                      {t('task_no_lists')}
                    </p>
                  )}
                  {selectedBoard.task_lists.map((list) => (
                    <Button
                      key={list.id}
                      type="button"
                      size="sm"
                      variant={listId === list.id ? 'default' : 'outline'}
                      onClick={() => setListId(list.id)}
                    >
                      {list.name}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {error && (
          <p className="text-destructive text-sm">{t('task_create_error')}</p>
        )}
        <Button
          type="button"
          disabled={!listId || creating}
          onClick={() => void create()}
        >
          {creating ? t('saving') : t('create_task')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
