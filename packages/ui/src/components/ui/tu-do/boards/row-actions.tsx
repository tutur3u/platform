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
import type { EnhancedTaskBoard } from '@tuturuuu/types/primitives/TaskBoard';
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
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CopyBoardDialog } from './copy-board-dialog';
import { TaskBoardForm } from './form';

interface ProjectRowActionsProps {
  row: Row<EnhancedTaskBoard>;
}

export function ProjectRowActions({ row }: ProjectRowActionsProps) {
  const router = useRouter();
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
        const error = await res.json();
        throw new Error(
          error.error || error.message || 'Failed to delete board'
        );
      }

      return res.json();
    },
    onSuccess: () => {
      toast.success('Board temporarily deleted');
      router.refresh();
      queryClient.invalidateQueries({ queryKey: ['boards', data.ws_id] });
    },
    onError: (error: Error) => {
      toast.error('Failed to delete board', {
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
        const error = await res.json();
        throw new Error(
          error.error ||
            error.message ||
            'Failed to permanently delete board'
        );
      }

      return res.json();
    },
    onSuccess: () => {
      toast.success('Board permanently deleted');
      router.refresh();
      setShowPermanentDeleteDialog(false);
      queryClient.invalidateQueries({ queryKey: ['boards', data.ws_id] });
    },
    onError: (error: Error) => {
      toast.error('Failed to permanently delete board', {
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
        const error = await res.json();
        throw new Error(
          error.error || error.message || 'Failed to restore board'
        );
      }

      return res.json();
    },
    onSuccess: () => {
      toast.success('Board restored successfully');
      router.refresh();
      queryClient.invalidateQueries({ queryKey: ['boards', data.ws_id] });
    },
    onError: (error: Error) => {
      toast.error('Failed to restore board', {
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
        const error = await res.json();
        throw new Error(
          error.error || error.message || 'Failed to archive board'
        );
      }

      return res.json();
    },
    onSuccess: () => {
      toast.success('Board archived successfully');
      router.refresh();
      setShowArchiveDialog(false);
      queryClient.invalidateQueries({ queryKey: ['boards', data.ws_id] });
    },
    onError: (error: Error) => {
      toast.error('Failed to archive board', {
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
        const error = await res.json();
        throw new Error(
          error.error || error.message || 'Failed to unarchive board'
        );
      }

      return res.json();
    },
    onSuccess: () => {
      toast.success('Board unarchived successfully');
      setShowUnarchiveDialog(false);
      queryClient.invalidateQueries({ queryKey: ['boards', data.ws_id] });
    },
    onError: (error: Error) => {
      toast.error('Failed to unarchive board', {
        description: error.message,
      });
    },
  });

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPermanentDeleteDialog, setShowPermanentDeleteDialog] = useState(false);
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
          <DropdownMenuContent align="end" className="w-[160px]">
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
                  Restore
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPermanentDeleteDialog(true);
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Forever
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
                  Unarchive
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCopyDialog(true);
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy
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
                  Copy
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowArchiveDialog(true);
                  }}
                >
                  <Archive className="mr-2 h-4 w-4" />
                  Archive
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
            <AlertDialogTitle>Move Board to Trash</AlertDialogTitle>
            <AlertDialogDescription>
               {(() => {
                const name = data.name ?? '';
                const truncated = name.length > 20;
                const display = truncated ? `${name.slice(0, 20)}…` : name;
                return <>Are you sure you want to delete &quot;{display}&quot;?</>;
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => softDeleteMutation.mutate()}
              disabled={softDeleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {softDeleteMutation.isPending ? 'Moving...' : 'Move to Trash'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore Dialog */}
      <AlertDialog
        open={showRestoreDialog}
        onOpenChange={setShowRestoreDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore Board</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to restore &quot;{data.name.slice(0, 20)}
              ...&quot;? The board will be moved back to your active boards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => restoreMutation.mutate()}
              disabled={restoreMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {restoreMutation.isPending ? 'Restoring...' : 'Restore Board'}
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
            <AlertDialogTitle>Permanently Delete Board</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete &quot;
              {data.name.slice(0, 20)}
              ...&quot;? This action cannot be undone and will permanently
              delete the board and all its tasks.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => permanentDeleteMutation.mutate()}
              disabled={permanentDeleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {permanentDeleteMutation.isPending
                ? 'Deleting...'
                : 'Delete Forever'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archive Dialog */}
      <AlertDialog
        open={showArchiveDialog}
        onOpenChange={setShowArchiveDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Board</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive &quot;{data.name.slice(0, 20)}
              ...&quot;? You can unarchive it later from the archived boards
              section.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => archiveMutation.mutate()}
              disabled={archiveMutation.isPending}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {archiveMutation.isPending ? 'Archiving...' : 'Archive Board'}
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
            <AlertDialogTitle>Unarchive Board</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to unarchive &quot;{data.name.slice(0, 20)}
              ...&quot;? The board will be moved back to your active boards.
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
                ? 'Unarchiving...'
                : 'Unarchive Board'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
