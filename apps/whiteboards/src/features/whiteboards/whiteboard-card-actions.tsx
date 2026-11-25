'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash,
} from '@tuturuuu/icons';
import {
  deleteWorkspaceWhiteboard,
  updateWorkspaceWhiteboard,
} from '@tuturuuu/internal-api/whiteboards';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';
import EditWhiteboardDialog from './edit-whiteboard-dialog';
import {
  type Whiteboard,
  type WhiteboardTranslator,
  whiteboardKeys,
} from './whiteboard-types';

export function WhiteboardCardAction({
  whiteboard,
  t,
}: {
  whiteboard: Whiteboard;
  t: WhiteboardTranslator;
}) {
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);

  const refreshList = () =>
    queryClient.invalidateQueries({
      queryKey: whiteboardKeys.list(whiteboard.wsId),
    });

  const deleteMutation = useMutation({
    mutationFn: () => deleteWorkspaceWhiteboard(whiteboard.wsId, whiteboard.id),
    onSuccess: () => {
      toast.success(t('delete_whiteboard_success'));
      return refreshList();
    },
    onError: (error) => {
      console.error('Error deleting whiteboard:', error);
      toast.error(t('delete_whiteboard_error'));
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (archive: boolean) =>
      updateWorkspaceWhiteboard(whiteboard.wsId, whiteboard.id, {
        archived_at: archive ? new Date().toISOString() : null,
      }),
    onSuccess: (_, archive) => {
      toast.success(archive ? t('archive_success') : t('unarchive_success'));
      return refreshList();
    },
    onError: (error) => {
      console.error('Error toggling archive status:', error);
      toast.error(t('error_occurred'));
    },
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="opacity-0 transition-opacity group-hover:opacity-100"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <EditWhiteboardDialog
            whiteboard={whiteboard}
            trigger={
              <DropdownMenuItem
                className="gap-2"
                onSelect={(e) => e.preventDefault()}
                onClick={(e) => e.stopPropagation()}
              >
                <Pencil className="h-4 w-4" />
                {t('edit')}
              </DropdownMenuItem>
            }
          />
          <DropdownMenuItem
            className="gap-2"
            onSelect={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              setShowArchiveDialog(true);
            }}
          >
            {whiteboard.archivedAt ? (
              <>
                <RefreshCw className="h-4 w-4" />
                {t('unarchive')}
              </>
            ) : (
              <>
                <Archive className="h-4 w-4" />
                {t('archive')}
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2 text-destructive focus:text-destructive"
            onSelect={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteDialog(true);
            }}
          >
            <Trash className="h-4 w-4" />
            {t('delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {whiteboard.archivedAt
                ? t('unarchive_whiteboard_title')
                : t('archive_whiteboard_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {whiteboard.archivedAt
                ? t('unarchive_whiteboard_description', {
                    title: whiteboard.title,
                  })
                : t('archive_whiteboard_description', {
                    title: whiteboard.title,
                  })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation();
                archiveMutation.mutate(!whiteboard.archivedAt);
                setShowArchiveDialog(false);
              }}
            >
              {whiteboard.archivedAt ? t('unarchive') : t('archive')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('confirm_delete_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete_task_confirmation', { name: whiteboard.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => e.stopPropagation()}>
              {t('cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.stopPropagation();
                deleteMutation.mutate();
                setShowDeleteDialog(false);
              }}
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
