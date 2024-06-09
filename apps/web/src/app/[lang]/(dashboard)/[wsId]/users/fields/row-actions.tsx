'use client';

import UserFieldEditDialog from './edit-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui/use-toast';
import { WorkspaceUserField } from '@/types/primitives/WorkspaceUserField';
import { DotsHorizontalIcon } from '@radix-ui/react-icons';
import { Row } from '@tanstack/react-table';
import useTranslation from 'next-translate/useTranslation';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface UserFieldRowActionsProps {
  row: Row<WorkspaceUserField>;
}

export function UserFieldRowActions({ row }: UserFieldRowActionsProps) {
  const router = useRouter();
  const { t } = useTranslation('ws-user-fields');

  const userField = row.original;

  const deleteUserField = async () => {
    const res = await fetch(
      `/api/v1/workspaces/${userField.ws_id}/users/fields/${userField.id}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      toast({
        title: 'Failed to delete workspace api key',
        description: data.message,
      });
    }
  };

  const [showEditDialog, setShowEditDialog] = useState(false);

  if (!userField.id || !userField.ws_id) return null;

  return (
    <>
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
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={deleteUserField}>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <UserFieldEditDialog
        data={userField}
        open={showEditDialog}
        setOpen={setShowEditDialog}
        submitLabel={t('edit_field')}
      />
    </>
  );
}
