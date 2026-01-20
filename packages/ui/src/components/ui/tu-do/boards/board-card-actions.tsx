'use client';

import { Archive, Edit, Ellipsis, RotateCcw, Trash2 } from '@tuturuuu/icons';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
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
import ModifiableDialogTrigger from '@tuturuuu/ui/custom/modifiable-dialog-trigger';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useBoardActions } from '@tuturuuu/ui/hooks/use-board-actions';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { TaskBoardForm } from './form';

interface BoardCardActionsProps {
  wsId: string;
  board: WorkspaceTaskBoard;
  className?: string; // Allow passing className for positioning/styling
}

export function BoardCardActions({
  wsId,
  board,
  className,
}: BoardCardActionsProps) {
  const t = useTranslations();
  const {
    softDeleteBoard,
    permanentDeleteBoard,
    restoreBoard,
    archiveBoard,
    unarchiveBoard,
  } = useBoardActions(wsId);

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPermanentDeleteDialog, setShowPermanentDeleteDialog] =
    useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showUnarchiveDialog, setShowUnarchiveDialog] = useState(false);

  return (
    <>
      <div className={className} onClick={(e) => e.stopPropagation()}>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
            >
              <Ellipsis className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {board.deleted_at ? (
              // Deleted board options
              <>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowRestoreDialog(true);
                  }}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {t('ws-task-boards.row_actions.restore')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPermanentDeleteDialog(true);
                  }}
                  className="text-dynamic-red focus:text-dynamic-red"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('ws-task-boards.row_actions.delete_forever')}
                </DropdownMenuItem>
              </>
            ) : board.archived_at ? (
              // Archived board options
              <>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowUnarchiveDialog(true);
                  }}
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {t('ws-task-boards.row_actions.unarchive')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteDialog(true);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('common.delete')}
                </DropdownMenuItem>
              </>
            ) : (
              // Active board options
              <>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowEditDialog(true);
                  }}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  {t('common.edit')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowArchiveDialog(true);
                  }}
                >
                  <Archive className="mr-2 h-4 w-4" />
                  {t('ws-task-boards.row_actions.archive')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteDialog(true);
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('common.delete')}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <ModifiableDialogTrigger
          data={board}
          open={showEditDialog}
          setOpen={setShowEditDialog}
          form={<TaskBoardForm wsId={wsId} data={board} />}
        />
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('ws-task-boards.row_actions.dialog.delete_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const name = board.name ?? '';
                const truncated = name.length > 20;
                const display = truncated ? `${name.slice(0, 20)}…` : name;
                return t(
                  'ws-task-boards.row_actions.dialog.delete_description',
                  {
                    name: display,
                  }
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation();
                softDeleteBoard(board.id);
              }}
              className="bg-dynamic-red text-white hover:bg-dynamic-red/90"
            >
              {t('ws-task-boards.row_actions.dialog.delete_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('ws-task-boards.row_actions.dialog.restore_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const name = board.name ?? '';
                const truncated = name.length > 20;
                const display = truncated ? `${name.slice(0, 20)}…` : name;
                return t(
                  'ws-task-boards.row_actions.dialog.restore_description',
                  { name: display }
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation();
                restoreBoard(board.id);
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {t('ws-task-boards.row_actions.dialog.restore_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showPermanentDeleteDialog}
        onOpenChange={setShowPermanentDeleteDialog}
      >
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('ws-task-boards.row_actions.dialog.delete_perm_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const name = board.name ?? '';
                const truncated = name.length > 20;
                const display = truncated ? `${name.slice(0, 20)}…` : name;
                return t(
                  'ws-task-boards.row_actions.dialog.delete_perm_description',
                  { name: display }
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation();
                permanentDeleteBoard(board.id);
              }}
              className="bg-dynamic-red text-white hover:bg-dynamic-red/90"
            >
              {t('ws-task-boards.row_actions.dialog.delete_perm_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('ws-task-boards.row_actions.dialog.archive_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const name = board.name ?? '';
                const truncated = name.length > 20;
                const display = truncated ? `${name.slice(0, 20)}…` : name;
                return t(
                  'ws-task-boards.row_actions.dialog.archive_description',
                  { name: display }
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation();
                archiveBoard(board.id);
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {t('ws-task-boards.row_actions.dialog.archive_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showUnarchiveDialog}
        onOpenChange={setShowUnarchiveDialog}
      >
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('ws-task-boards.row_actions.dialog.unarchive_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const name = board.name ?? '';
                const truncated = name.length > 20;
                const display = truncated ? `${name.slice(0, 20)}…` : name;
                return t(
                  'ws-task-boards.row_actions.dialog.unarchive_description',
                  { name: display }
                );
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation();
                unarchiveBoard(board.id);
              }}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {t('ws-task-boards.row_actions.dialog.unarchive_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
