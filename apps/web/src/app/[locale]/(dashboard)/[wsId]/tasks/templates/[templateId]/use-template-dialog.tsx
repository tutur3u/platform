'use client';

import { KanbanSquare, ListTodo, Loader2, Plus, Tags } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

interface UseTemplateDialogProps {
  wsId: string;
  templateId: string;
  templateName: string;
  templateStats: {
    lists: number;
    tasks: number;
    labels: number;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UseTemplateDialog({
  wsId,
  templateId,
  templateName,
  templateStats,
  open,
  onOpenChange,
}: UseTemplateDialogProps) {
  const t = useTranslations('ws-board-templates');
  const router = useRouter();

  const [isUsing, setIsUsing] = useState(false);
  const [newBoardName, setNewBoardName] = useState(`${templateName} Copy`);

  const boardNameId = useId();

  const handleUseTemplate = async () => {
    if (!newBoardName.trim()) {
      toast.error(t('detail.board_name_required'));
      return;
    }

    setIsUsing(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/templates/${templateId}/use`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            boardName: newBoardName.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create board from template');
      }

      toast.success(t('detail.use_success'), {
        description: t('detail.use_success_description', {
          lists: data.stats.listsCreated,
          tasks: data.stats.tasksCreated,
        }),
      });

      onOpenChange(false);
      router.push(`/${wsId}/tasks/boards/${data.board.id}`);
    } catch (error) {
      console.error('Error using template:', error);
      toast.error(
        error instanceof Error ? error.message : t('detail.use_error')
      );
    } finally {
      setIsUsing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            {t('detail.use_dialog_title')}
          </DialogTitle>
          <DialogDescription>
            {t('detail.use_dialog_description', { name: templateName })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={boardNameId}>{t('detail.board_name_label')}</Label>
            <Input
              id={boardNameId}
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              placeholder={t('detail.board_name_placeholder')}
              maxLength={255}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleUseTemplate();
                }
              }}
            />
          </div>
          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="mb-2 font-medium">{t('detail.will_create_label')}</p>
            <ul className="space-y-1 text-muted-foreground text-xs">
              <li className="flex items-center gap-2">
                <KanbanSquare className="h-3.5 w-3.5" />
                {templateStats.lists} {t('gallery.lists')}
              </li>
              <li className="flex items-center gap-2">
                <ListTodo className="h-3.5 w-3.5" />
                {templateStats.tasks} {t('gallery.tasks')}
              </li>
              {templateStats.labels > 0 && (
                <li className="flex items-center gap-2">
                  <Tags className="h-3.5 w-3.5" />
                  {templateStats.labels} {t('gallery.labels')}
                </li>
              )}
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isUsing}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleUseTemplate}
            disabled={isUsing || !newBoardName.trim()}
          >
            {isUsing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('detail.create_board')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
