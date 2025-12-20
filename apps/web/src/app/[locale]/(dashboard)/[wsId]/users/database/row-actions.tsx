'use client';

import type { Row } from '@tanstack/react-table';
import { Ellipsis, Eye } from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import UserForm from './form';

interface UserRowActionsProps {
  row: Row<WorkspaceUser>;
  href?: string;
  // biome-ignore lint/suspicious/noExplicitAny: <extra data can be anything>
  extraData?: any;
}

export function UserRowActions({ row, href, extraData }: UserRowActionsProps) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();

  const user = row.original;
  const [open, setOpen] = useState(false);

  const handleFormSuccess = () => {
    toast({
      title: t('ws-members.member-updated'),
      description: `"${user?.display_name || user?.full_name || 'Unknown'}" ${t(
        'ws-members.has-been-updated'
      )}`,
      color: 'teal',
    });
    setOpen(false);
    router.refresh();
  };

  const handleFormError = (error: string) => {
    toast({
      title: t('ws-members.error'),
      description: error,
      variant: 'destructive',
    });
  };

  const deleteUser = async () => {
    const res = await fetch(
      `/api/v1/workspaces/${user.ws_id}/users/${user.id}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      toast({
        title: 'Failed to delete workspace user',
        description: data.message,
        variant: 'destructive',
      });
    }
  };

  const removeUserFromGroup = async ({
    wsId,
    groupId,
    userId,
  }: {
    wsId: string;
    groupId: string;
    userId: string;
  }) => {
    const res = await fetch(
      `/api/v1/workspaces/${wsId}/user-groups/${groupId}/members/${userId}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      toast({
        title: 'Failed to remove user from group',
        description: data.message,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      {href && (extraData?.hasPublicInfo || extraData?.hasPrivateInfo) && (
        <Link href={href}>
          <Button>
            <Eye className="mr-1 h-5 w-5" />
            {t('common.view')}
          </Button>
        </Link>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[80vh] max-w-4xl overflow-y-scroll"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{t('ws-members.member-settings')}</DialogTitle>
            <DialogDescription>
              {t('ws-members.delete-member-description')}
            </DialogDescription>
          </DialogHeader>

          <UserForm
            wsId={user.ws_id!}
            data={user}
            onSuccess={handleFormSuccess}
            onError={handleFormError}
            showUserID={true}
          />
        </DialogContent>
      </Dialog>

      {!extraData?.canUpdateUsers && !extraData?.canDeleteUsers ? null : (
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
          <DropdownMenuContent align="end" className="w-[160px]">
            {extraData?.canUpdateUsers && (
              <DropdownMenuItem onClick={() => setOpen(true)}>
                {t('common.edit')}
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />
            {pathname.includes('/users/database') &&
              extraData?.canDeleteUsers && (
                <DropdownMenuItem
                  onClick={deleteUser}
                  disabled={!user.id || !user.ws_id}
                >
                  {t('common.delete')}
                </DropdownMenuItem>
              )}
            {extraData?.wsId && extraData?.groupId && (
              <DropdownMenuItem
                onClick={() =>
                  removeUserFromGroup({
                    wsId: extraData.wsId,
                    groupId: extraData.groupId,
                    userId: user.id,
                  })
                }
                disabled={!user.id || !user.ws_id}
              >
                {t('user-data-table.remove-from-group')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
