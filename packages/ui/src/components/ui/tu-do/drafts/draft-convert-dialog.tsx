'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type { TaskDraft } from './draft-card';

interface DraftConvertDialogProps {
  draft: TaskDraft | null;
  wsId: string;
  isOpen: boolean;
  onClose: () => void;
  onConverted: () => void;
}

export function DraftConvertDialog({
  draft,
  wsId,
  isOpen,
  onClose,
  onConverted,
}: DraftConvertDialogProps) {
  const t = useTranslations('task-drafts');
  const [selectedBoardId, setSelectedBoardId] = useState<string>('');
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [isConverting, setIsConverting] = useState(false);

  // Sync selections when draft changes (useState initializer only runs on mount)
  useEffect(() => {
    if (draft) {
      setSelectedBoardId(draft.board_id ?? '');
      setSelectedListId(draft.list_id ?? '');
    }
  }, [draft]);

  const supabase = createClient();

  const { data: boards = [] } = useQuery({
    queryKey: ['workspace-boards', wsId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_boards')
        .select('id, name')
        .eq('ws_id', wsId)
        .is('deleted_at', null)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: isOpen,
  });

  const { data: lists = [] } = useQuery({
    queryKey: ['board-lists', selectedBoardId],
    queryFn: async () => {
      if (!selectedBoardId) return [];
      const { data, error } = await supabase
        .from('task_lists')
        .select('id, name, status')
        .eq('board_id', selectedBoardId)
        .eq('deleted', false)
        .order('position');
      if (error) throw error;
      return data;
    },
    enabled: isOpen && !!selectedBoardId,
  });

  const handleBoardChange = (boardId: string) => {
    setSelectedBoardId(boardId);
    setSelectedListId('');
  };

  const handleConvert = async () => {
    if (!draft || !selectedListId) return;

    setIsConverting(true);
    try {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/task-drafts/${draft.id}/convert`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listId: selectedListId }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to convert draft');
      }

      toast.success(t('converted_success'));
      onConverted();
      onClose();
    } catch (error) {
      console.error('Error converting draft:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to convert draft'
      );
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('convert_to_task')}</DialogTitle>
          <DialogDescription>{draft?.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>{t('select_board')}</Label>
            <Select value={selectedBoardId} onValueChange={handleBoardChange}>
              <SelectTrigger>
                <SelectValue placeholder={t('select_board')} />
              </SelectTrigger>
              <SelectContent>
                {boards.map((board) => (
                  <SelectItem key={board.id} value={board.id}>
                    {board.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t('select_list')}</Label>
            <Select
              value={selectedListId}
              onValueChange={setSelectedListId}
              disabled={!selectedBoardId}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('select_list')} />
              </SelectTrigger>
              <SelectContent>
                {lists.map((list) => (
                  <SelectItem key={list.id} value={list.id}>
                    {list.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isConverting}>
            Cancel
          </Button>
          <Button
            onClick={handleConvert}
            disabled={!selectedListId || isConverting}
          >
            {isConverting ? t('converting') : t('convert_to_task')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
