'use client';

import type { Row } from '@tanstack/react-table';
import type { WorkspaceUserField } from '@tuturuuu/types/primitives/WorkspaceUserField';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Ellipsis } from '@tuturuuu/ui/icons';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import UserFieldEditDialog from './edit-dialog';

interface UserFieldRowActionsProps {
  row: Row<WorkspaceUserField>;
}

export function UserFieldRowActions({ row }: UserFieldRowActionsProps) {
  const router = useRouter();
  const t = useTranslations();

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
    <div className="flex items-center justify-end gap-2">
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
          <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
            {t('common.edit')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={deleteUserField}>
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <UserFieldEditDialog
        data={userField}
        open={showEditDialog}
        setOpen={setShowEditDialog}
        submitLabel={t('ws-user-fields.edit_field')}
      />
    </div>
  );
}
