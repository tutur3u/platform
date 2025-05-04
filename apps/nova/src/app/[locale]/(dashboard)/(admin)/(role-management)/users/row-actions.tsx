'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Row } from '@tanstack/react-table';
import { PlatformUser, User, UserPrivateDetails } from '@tuturuuu/types/db';
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Ellipsis, ExternalLink } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface NovaUserRowActionsProps {
  row: Row<User & PlatformUser & UserPrivateDetails & { team_name: string[] }>;
}

export function NovaUsersRowActions({ row }: NovaUserRowActionsProps) {
  const router = useRouter();
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const user = row.original;
  const userId = user.id;

  const deleteUser = async () => {
    const res = await fetch(`/api/v1/nova/users/${userId}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      router.refresh();
    }
  };

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="data-[state=open]:bg-muted flex h-8 w-8 p-0"
            >
              <Ellipsis className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[160px]">
            <DropdownMenuItem
              // onClick={() => window.open(`/profile/${userId}`, '_blank')}
              className="flex items-center"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View Profile
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() => setShowDeleteDialog(true)}
              className="text-destructive"
            >
              {t('common.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
            <AlertDialogDescription>
              Do you want to delete this user?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteUser}
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
