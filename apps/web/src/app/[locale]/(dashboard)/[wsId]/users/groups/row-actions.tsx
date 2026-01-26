'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { Row } from '@tanstack/react-table';
import { Ellipsis, Eye, Loader2 } from '@tuturuuu/icons';
import type { UserGroup } from '@tuturuuu/types/primitives/UserGroup';
import {
  AlertDialog,
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
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import UserGroupForm from './form';

interface UserGroupRowActionsProps {
  row: Row<UserGroup>;
  canUpdate?: boolean;
  canDelete?: boolean;
  canCreate?: boolean;
}

export function UserGroupRowActions({
  row,
  canUpdate = false,
  canDelete = false,
  canCreate = false,
}: UserGroupRowActionsProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations();

  const data = row.original;

  const deleteUserGroup = async () => {
    setIsDeleting(true);

    try {
      const res = await fetch(
        `/api/v1/workspaces/${data.ws_id}/user-groups/${data.id}`,
        {
          method: 'DELETE',
        }
      );

      if (res.ok) {
        toast.success(t('ws-user-groups.delete_success'));
        setShowDeleteDialog(false);
        queryClient.invalidateQueries({
          queryKey: ['workspace-user-groups', data.ws_id],
        });
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.message);
      }
    } catch (error) {
      console.error(error);
      toast.error(t('common.error'));
    } finally {
      setIsDeleting(false);
    }
  };

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!data.id || !data.ws_id) return null;

  return (
    <div className="flex items-center justify-end gap-2">
      {data.href && (
        <Link href={data.href}>
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
          >
            <Ellipsis className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {canUpdate && (
            <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
              {t('common.edit')}
            </DropdownMenuItem>
          )}
          {(canUpdate || canDelete) && <DropdownMenuSeparator />}
          {canDelete && (
            <DropdownMenuItem onClick={() => setShowDeleteDialog(true)}>
              {t('common.delete')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {canUpdate && (
        <ModifiableDialogTrigger
          data={data}
          open={showEditDialog}
          title={t('ws-user-groups.edit')}
          editDescription={t('ws-user-groups.edit_description')}
          setOpen={setShowEditDialog}
          form={
            <UserGroupForm
              wsId={data.ws_id}
              data={data}
              canCreate={canCreate}
              canUpdate={canUpdate}
            />
          }
        />
      )}

      {canDelete && (
        <AlertDialog
          open={showDeleteDialog}
          onOpenChange={(open) => {
            // Prevent closing while deleting
            if (!isDeleting) {
              setShowDeleteDialog(open);
            }
          }}
        >
          <AlertDialogContent
            onEscapeKeyDown={(e) => isDeleting && e.preventDefault()}
          >
            <AlertDialogHeader>
              <AlertDialogTitle>{t('ws-user-groups.delete')}</AlertDialogTitle>
              <AlertDialogDescription className="space-y-2">
                <p>{t('ws-user-groups.delete_confirmation')}</p>
                <p className="font-semibold text-destructive">
                  {t('ws-user-groups.delete_warning')}
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>
                {t('common.cancel')}
              </AlertDialogCancel>
              <Button
                variant="destructive"
                onClick={deleteUserGroup}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('common.deleting')}
                  </>
                ) : (
                  t('common.delete')
                )}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
