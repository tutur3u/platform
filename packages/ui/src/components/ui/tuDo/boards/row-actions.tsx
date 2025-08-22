'use client';

import type { Row } from '@tanstack/react-table';
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
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Ellipsis, Eye } from '@tuturuuu/ui/icons';
import { TaskBoardForm } from '@tuturuuu/ui/tuDo/boards/form';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface ProjectRowActionsProps {
  row: Row<EnhancedTaskBoard>;
}

export function ProjectRowActions({ row }: ProjectRowActionsProps) {
  const router = useRouter();
  const t = useTranslations();

  const data = row.original;

  const deleteData = async () => {
    const res = await fetch(
      `/api/v1/workspaces/${data.ws_id}/task-boards/${data.id}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      router.refresh();
      setShowDeleteDialog(false);
    } else {
      const data = await res.json();
      toast({
        title: 'Failed to delete workspace project',
        description: data.message,
      });
    }
  };

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

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
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setShowEditDialog(true);
              }}
            >
              {t('common.edit')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setShowDeleteDialog(true);
              }}
            >
              {t('common.delete')}
            </DropdownMenuItem>
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

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task Board</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{data.name.slice(0, 20)}
              ...&quot;? This action cannot be undone and will permanently
              delete the task board and all its tasks.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteData}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
