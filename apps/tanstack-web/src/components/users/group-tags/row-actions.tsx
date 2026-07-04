'use client';

import type { Row } from '@tanstack/react-table';
import { Ellipsis } from '@tuturuuu/icons';
import { deleteWorkspaceGroupTag } from '@tuturuuu/internal-api';
import type { UserGroupTag } from '@tuturuuu/types/primitives/UserGroupTag';
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
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import GroupTagForm from './form';

interface GroupTagRowActionsProps {
  row: Row<UserGroupTag>;
}

export function GroupTagRowActions({ row }: GroupTagRowActionsProps) {
  const router = useRouter();
  const t = useTranslations();

  const data = row.original;

  const deleteGroupTag = async () => {
    // Forwarded-auth facade over DELETE /group-tags/:id (replaces the legacy raw
    // client-side fetch — disallowed in tanstack-web).
    try {
      if (data.ws_id && data.id) {
        await deleteWorkspaceGroupTag(data.ws_id, data.id);
      }
      router.refresh();
    } catch (error) {
      toast({
        title: 'Failed to delete user group tag',
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const [showEditDialog, setShowEditDialog] = useState(false);

  if (!data.id || !data.ws_id) return null;

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
          <DropdownMenuItem onClick={deleteGroupTag}>
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
        form={<GroupTagForm wsId={data.ws_id} data={data} />}
      />
    </div>
  );
}
