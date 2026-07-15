'use client';

import { Share2 } from '@tuturuuu/icons';
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
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { BoardShareSettingsPanel } from './board-share-settings-panel';

interface BoardShareDialogProps {
  board: Pick<WorkspaceTaskBoard, 'id' | 'name'>;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  wsId: string;
}

export function BoardShareDialog({
  board,
  onOpenChange,
  open,
  wsId,
}: BoardShareDialogProps) {
  const t = useTranslations();
  const initialFocusRef = useRef<HTMLDivElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(88dvh,720px)] overflow-y-auto sm:max-w-xl"
        onClick={(e) => e.stopPropagation()}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          initialFocusRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            {t('ws-task-boards.share.title', {
              name: board.name || t('common.untitled'),
            })}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('ws-task-boards.share.title', {
              name: board.name || t('common.untitled'),
            })}
          </DialogDescription>
        </DialogHeader>
        <div ref={initialFocusRef} tabIndex={-1} className="sr-only" />

        <BoardShareSettingsPanel board={board} enabled={open} wsId={wsId} />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
