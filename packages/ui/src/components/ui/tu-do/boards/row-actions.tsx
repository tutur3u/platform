'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Row } from '@tanstack/react-table';
import {
  Archive,
  Copy,
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
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { CopyBoardDialog } from './copy-board-dialog';
import { TaskBoardForm } from './form';

// Helper to safely parse JSON responses or return null on error
async function jsonOrNull<T = unknown>(res: Response): Promise<T | null> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

interface ProjectRowActionsProps {
  row: Row<WorkspaceTaskBoard>;
}

export function ProjectRowActions({ row }: ProjectRowActionsProps) {
  const queryClient = useQueryClient();
  const t = useTranslations();

  const data = row.original;

  // Soft delete mutation
  const softDeleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/v1/workspaces/${data.ws_id}/boards/${data.id}/trash`,
        {
          method: 'POST',
        }
      );

      if (!res.ok) {
        const error = await jsonOrNull<{ error?: string; message?: string }>(
          res
        );
        throw new Error(
          error?.error || error?.message || 'Failed to soft delete board'
        );
      }

      await jsonOrNull(res);
      return;
    },
    onSuccess: () => {
      toast.success(t('ws-task-boards.row_actions.toast.delete_temp_success'));
      setShowDeleteDialog(false);
      queryClient.invalidateQueries({ queryKey: ['boards', data.ws_id] });
    },
    onError: (error: Error) => {
      toast.error(t('ws-task-boards.row_actions.toast.delete_temp_error'), {
        description: error.message,
      });
    },
  });

  // Permanent delete mutation
  const permanentDeleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/v1/workspaces/${data.ws_id}/boards/${data.id}`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) {
        const error = await jsonOrNull<{ error?: string; message?: string }>(
          res
        );
        throw new Error(
          error?.error || error?.message || 'Failed to permanently delete board'
        );
      }

      await jsonOrNull(res);
      return;
    },
    onSuccess: () => {
      toast.success(t('ws-task-boards.row_actions.toast.delete_perm_success'));
      setShowPermanentDeleteDialog(false);
      queryClient.invalidateQueries({ queryKey: ['boards', data.ws_id] });
    },
    onError: (error: Error) => {
      toast.error(t('ws-task-boards.row_actions.toast.delete_perm_error'), {
        description: error.message,
      });
    },
  });

  // Restore mutation
  const restoreMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/v1/workspaces/${data.ws_id}/boards/${data.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restore: true }),
        }
      );

      if (!res.ok) {
        const error = await jsonOrNull<{ error?: string; message?: string }>(
          res
        );
        throw new Error(
          error?.error || error?.message || 'Failed to restore board'
        );
      }

      await jsonOrNull(res);
      return;
    },
    onSuccess: () => {
      toast.success(t('ws-task-boards.row_actions.toast.restore_success'));
      setShowRestoreDialog(false);
      queryClient.invalidateQueries({ queryKey: ['boards', data.ws_id] });
    },
    onError: (error: Error) => {
      toast.error(t('ws-task-boards.row_actions.toast.restore_error'), {
        description: error.message,
      });
    },
  });

  // Archive mutation
  const archiveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/v1/workspaces/${data.ws_id}/boards/${data.id}/archive`,
        {
          method: 'POST',
        }
      );

      if (!res.ok) {
        const error = await jsonOrNull<{ error?: string; message?: string }>(
          res
        );
        throw new Error(
          error?.error || error?.message || 'Failed to archive board'
        );
      }

      await jsonOrNull(res);
      return;
    },
    onSuccess: () => {
      toast.success(t('ws-task-boards.row_actions.toast.archive_success'));
      setShowArchiveDialog(false);
      queryClient.invalidateQueries({ queryKey: ['boards', data.ws_id] });
    },
    onError: (error: Error) => {
      toast.error(t('ws-task-boards.row_actions.toast.archive_error'), {
        description: error.message,
      });
    },
  });

  // Unarchive mutation
  const unarchiveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/v1/workspaces/${data.ws_id}/boards/${data.id}/archive`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) {
        const error = await jsonOrNull<{ error?: string; message?: string }>(
          res
        );
        throw new Error(
          error?.error || error?.message || 'Failed to unarchive board'
        );
      }

      await jsonOrNull(res);
      return;
    },
    onSuccess: () => {
      toast.success(t('ws-task-boards.row_actions.toast.unarchive_success'));
      setShowUnarchiveDialog(false);
      queryClient.invalidateQueries({ queryKey: ['boards', data.ws_id] });
    },
    onError: (error: Error) => {
      toast.error(t('ws-task-boards.row_actions.toast.unarchive_error'), {
        description: error.message,
      });
    },
  });

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPermanentDeleteDialog, setShowPermanentDeleteDialog] =
    useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showUnarchiveDialog, setShowUnarchiveDialog] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);

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
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCopyDialog(true);
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {t('ws-task-boards.row_actions.copy')}
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
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCopyDialog(true);
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {t('ws-task-boards.row_actions.copy')}
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
          title={t('ws-user-group-tags.edit')}
          editDescription={t('ws-user-group-tags.edit_description')}
          setOpen={setShowEditDialog}
          form={<TaskBoardForm wsId={data.ws_id} data={data} />}
        />
      </div>

      <CopyBoardDialog
        board={data}
        open={showCopyDialog}
        onOpenChange={setShowCopyDialog}
      />

      {/* Soft Delete Dialog */}
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
              onClick={() => softDeleteMutation.mutate()}
              disabled={softDeleteMutation.isPending}
              className="bg-dynamic-red text-white hover:bg-dynamic-red/90"
            >
              {softDeleteMutation.isPending
                ? t('ws-task-boards.row_actions.dialog.delete_button_moving')
                : t('ws-task-boards.row_actions.dialog.delete_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore Dialog */}
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
              onClick={() => restoreMutation.mutate()}
              disabled={restoreMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {restoreMutation.isPending
                ? t(
                    'ws-task-boards.row_actions.dialog.restore_button_restoring'
                  )
                : t('ws-task-boards.row_actions.dialog.restore_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Permanent Delete Dialog */}
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
              onClick={() => permanentDeleteMutation.mutate()}
              disabled={permanentDeleteMutation.isPending}
              className="bg-dynamic-red text-white hover:bg-dynamic-red/90"
            >
              {permanentDeleteMutation.isPending
                ? t(
                    'ws-task-boards.row_actions.dialog.delete_perm_button_deleting'
                  )
                : t('ws-task-boards.row_actions.dialog.delete_perm_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archive Dialog */}
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
              onClick={() => archiveMutation.mutate()}
              disabled={archiveMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {archiveMutation.isPending
                ? t(
                    'ws-task-boards.row_actions.dialog.archive_button_archiving'
                  )
                : t('ws-task-boards.row_actions.dialog.archive_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unarchive Dialog */}
      <AlertDialog
        open={showUnarchiveDialog}
        onOpenChange={setShowUnarchiveDialog}
      >
        <AlertDialogContent>
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
              onClick={() => unarchiveMutation.mutate()}
              disabled={unarchiveMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {unarchiveMutation.isPending
                ? t(
                    'ws-task-boards.row_actions.dialog.unarchive_button_unarchiving'
                  )
                : t('ws-task-boards.row_actions.dialog.unarchive_button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
