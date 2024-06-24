'use client';

import UserGroupEditDialog from './edit-dialog';
import { UserGroup } from '@/types/primitives/UserGroup';
import { DotsHorizontalIcon } from '@radix-ui/react-icons';
import { Button } from '@repo/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/ui/components/ui/dropdown-menu';
import { toast } from '@repo/ui/hooks/use-toast';
import { Row } from '@tanstack/react-table';
import { Eye } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface UserGroupRowActionsProps {
  row: Row<UserGroup>;
}

export function UserGroupRowActions({ row }: UserGroupRowActionsProps) {
  const router = useRouter();
  const { t } = useTranslation('ws-user-group-tags');

  const groupTag = row.original;

  const deleteUserGroup = async () => {
    const res = await fetch(
      `/api/v1/workspaces/${groupTag.ws_id}/group-tags/${groupTag.id}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      toast({
        title: 'Failed to delete workspace user group tag',
        description: data.message,
      });
    }
  };

  const [showEditDialog, setShowEditDialog] = useState(false);

  if (!groupTag.id || !groupTag.ws_id) return null;

  return (
    <div className="flex items-center justify-end gap-2">
      {groupTag.href && (
        <Link href={groupTag.href}>
          <Button>
            <Eye className="mr-1 h-5 w-5" />
            {t('common:view')}
          </Button>
        </Link>
      )}

      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="data-[state=open]:bg-muted flex h-8 w-8 p-0"
          >
            <DotsHorizontalIcon className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
            {t('common:edit')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={deleteUserGroup}>
            {t('common:delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <UserGroupEditDialog
        data={groupTag}
        open={showEditDialog}
        setOpen={setShowEditDialog}
        submitLabel={t('edit_tag')}
      />
    </div>
  );
}
