'use client';

import type { Row } from '@tanstack/react-table';
import {
  Archive,
  Edit,
  Ellipsis,
  Eye,
  RotateCcw,
  Trash2,
} from '@tuturuuu/icons';
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
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { TaskBoardForm } from './form';

interface ProjectRowActionsProps {
  row: Row<WorkspaceTaskBoard>;
}

export function ProjectRowActions({ row }: ProjectRowActionsProps) {
  const t = useTranslations();
  const data = row.original;
  const {
    softDeleteBoard,
    permanentDeleteBoard,
    restoreBoard,
    archiveBoard,
    unarchiveBoard,
  } = useBoardActions(data.ws_id);

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPermanentDeleteDialog, setShowPermanentDeleteDialog] =
    useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showUnarchiveDialog, setShowUnarchiveDialog] = useState(false);

  // No need for onSuccess callback - mutations handle invalidation
  // React Query will automatically refetch and update the UI

  if (!data.id || !data.ws_id) return null;

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        {data.href && (
          <Link href={data.href} onClick={(e) => e.stopPropagation()}>
            <Button>
              <Eye className="mr-1 h-5 w-5" />
              {t('common.view')}
            </Button>
          </Link>
        )}

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
              onClick={(e) => e.stopPropagation()}
            >
              <Ellipsis className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            {data.deleted_at ? (
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
            ) : data.archived_at ? (
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
          data={data}
          open={showEditDialog}
          // title={t('ws-user-group-tags.edit')}
          // editDescription={t('ws-user-group-tags.edit_description')}
          setOpen={setShowEditDialog}
          form={<TaskBoardForm wsId={data.ws_id} data={data} />}
        />
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('ws-task-boards.row_actions.dialog.delete_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const name = data.name ?? '';
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
              onClick={() => softDeleteBoard(data.id)}
              className="bg-dynamic-red text-white hover:bg-dynamic-red/90"
            >
              {t('ws-task-boards.row_actions.dialog.delete_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('ws-task-boards.row_actions.dialog.restore_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const name = data.name ?? '';
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
              onClick={() => restoreBoard(data.id)}
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('ws-task-boards.row_actions.dialog.delete_perm_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const name = data.name ?? '';
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
              onClick={() => permanentDeleteBoard(data.id)}
              className="bg-dynamic-red text-white hover:bg-dynamic-red/90"
            >
              {t('ws-task-boards.row_actions.dialog.delete_perm_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('ws-task-boards.row_actions.dialog.archive_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const name = data.name ?? '';
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
              onClick={() => archiveBoard(data.id)}
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
                const name = data.name ?? '';
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
              onClick={() => unarchiveBoard(data.id)}
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
