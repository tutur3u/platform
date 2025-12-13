'use client';

import { Copy, Loader2 } from '@tuturuuu/icons';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
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
import { useEffect, useId, useState } from 'react';

interface CopyBoardDialogProps {
  board: Pick<WorkspaceTaskBoard, 'id' | 'ws_id' | 'name'>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CopyBoardDialog({
  board,
  open,
  onOpenChange,
}: CopyBoardDialogProps) {
  const t = useTranslations();
  const router = useRouter();
  const boardNameId = useId();

  const [newBoardName, setNewBoardName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  // Initialize board name when dialog opens
  useEffect(() => {
    if (open && board) {
      const suffix = t('ws-task-boards.duplicate_dialog.default_suffix');
      setNewBoardName(`${board.name ?? ''} (${suffix})`);
    }
  }, [open, board, t]);

  const handleCopyBoard = async () => {
    if (!newBoardName.trim()) {
      toast.error(t('ws-task-boards.duplicate_dialog.name_required'));
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${board.ws_id}/task-boards/${board.id}/copy`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            // NOTE: copying across workspaces is intentionally not supported.
            // The API route enforces this too.
            targetWorkspaceId: board.ws_id,
            newBoardName: newBoardName.trim(),
          }),
        }
      );

      const data = await response.json();

      if (response.ok) {
        toast.success(t('ws-task-boards.duplicate_dialog.success'));

        // Reset form and close dialog
        setNewBoardName('');
        onOpenChange(false);

        // Refresh the current page to show updated boards
        router.refresh();
      } else {
        throw new Error(data.error || 'Failed to copy board');
      }
    } catch (error) {
      console.error('Error copying board:', error);
      toast.error(
        error instanceof Error
          ? error.message
          : t('ws-task-boards.duplicate_dialog.failed')
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setNewBoardName('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            {t('ws-task-boards.duplicate_dialog.title')}
          </DialogTitle>
          <DialogDescription>
            {t('ws-task-boards.duplicate_dialog.description', {
              name: board.name ?? '',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Board Name */}
          <div className="space-y-2">
            <Label htmlFor={boardNameId}>
              {t('ws-task-boards.duplicate_dialog.name_label')}
            </Label>
            <Input
              id={boardNameId}
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              placeholder={t(
                'ws-task-boards.duplicate_dialog.name_placeholder'
              )}
              maxLength={255}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={isLoading}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleCopyBoard}
            disabled={isLoading || !newBoardName.trim()}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('ws-task-boards.duplicate_dialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
