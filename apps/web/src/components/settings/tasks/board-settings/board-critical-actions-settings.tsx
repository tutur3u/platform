'use client';

import { Archive, Bookmark, Copy, RotateCcw, Trash2 } from '@tuturuuu/icons';
import type { WorkspaceTaskBoardDetail } from '@tuturuuu/internal-api/tasks';
import { CopyBoardDialog } from '@tuturuuu/tasks-ui/tu-do/boards/copy-board-dialog';
import { SaveAsTemplateDialog } from '@tuturuuu/tasks-ui/tu-do/templates/save-as-template-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { useBoardActions } from '@tuturuuu/ui/hooks/use-board-actions';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { getTasksAppUrlClient } from '@/lib/tasks-app-url-client';

export function BoardCriticalActionsSettings({
  board,
  onRefresh,
  wsId,
}: {
  board: WorkspaceTaskBoardDetail;
  onRefresh: () => void;
  wsId: string;
}) {
  const t = useTranslations();
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { archiveBoard, softDeleteBoard, unarchiveBoard } =
    useBoardActions(wsId);

  const boardForDialog = {
    id: board.id,
    name: board.name,
    ws_id: board.ws_id ?? wsId,
  };

  return (
    <div className="space-y-4 rounded-lg border bg-background p-4">
      <div className="space-y-1">
        <h3 className="font-medium">{t('settings.tasks.board_actions')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('settings.tasks.board_actions_description')}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Button
          className="justify-start gap-2"
          onClick={() => setDuplicateOpen(true)}
          type="button"
          variant="outline"
        >
          <Copy className="h-4 w-4" />
          {t('settings.tasks.duplicate_board')}
        </Button>
        <Button
          className="justify-start gap-2"
          onClick={() => setTemplateOpen(true)}
          type="button"
          variant="outline"
        >
          <Bookmark className="h-4 w-4" />
          {t('settings.tasks.save_as_template')}
        </Button>
        {board.archived_at ? (
          <Button
            className="justify-start gap-2"
            onClick={() => unarchiveBoard(board.id, { onSuccess: onRefresh })}
            type="button"
            variant="outline"
          >
            <RotateCcw className="h-4 w-4" />
            {t('settings.tasks.unarchive_board')}
          </Button>
        ) : (
          <Button
            className="justify-start gap-2"
            onClick={() => archiveBoard(board.id, { onSuccess: onRefresh })}
            type="button"
            variant="outline"
          >
            <Archive className="h-4 w-4" />
            {t('settings.tasks.archive_board')}
          </Button>
        )}
        <Button
          className="justify-start gap-2 text-destructive hover:text-destructive"
          onClick={() => setDeleteOpen(true)}
          type="button"
          variant="outline"
        >
          <Trash2 className="h-4 w-4" />
          {t('settings.tasks.delete_board')}
        </Button>
      </div>

      <CopyBoardDialog
        board={boardForDialog}
        onOpenChange={setDuplicateOpen}
        open={duplicateOpen}
      />
      <SaveAsTemplateDialog
        board={boardForDialog}
        onOpenChange={setTemplateOpen}
        open={templateOpen}
      />
      <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.tasks.delete_board')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.tasks.delete_board_description', {
                name: board.name || t('common.untitled'),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                softDeleteBoard(board.id, {
                  onSuccess: () => {
                    setDeleteOpen(false);
                    window.location.assign(
                      getTasksAppUrlClient(`/${wsId}/boards`)
                    );
                  },
                })
              }
            >
              {t('settings.tasks.confirm_delete_board')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
