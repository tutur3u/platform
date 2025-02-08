'use client';

import UserFieldEditDialog from './edit-dialog';
import { WorkspaceUserField } from '@repo/types/primitives/WorkspaceUserField';
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
import { Ellipsis } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
