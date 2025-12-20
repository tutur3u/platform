'use client';

import type { Row } from '@tanstack/react-table';
import { Ellipsis } from '@tuturuuu/icons';
import type { WorkspaceSecret } from '@tuturuuu/types/primitives/WorkspaceSecret';
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
import SecretForm from './form';

interface SecretRowActionsProps {
  row: Row<WorkspaceSecret>;
}

export function SecretRowActions({ row }: SecretRowActionsProps) {
  const router = useRouter();
  const t = useTranslations();

  const data = row.original;

  const deleteSecret = async () => {
    const res = await fetch(
      `/api/workspaces/${data.ws_id}/secrets/${data.id}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      toast({
        title: 'Failed to delete workspace secret',
        description: data.message,
      });
    }
  };

  const [showEditDialog, setShowEditDialog] = useState(false);

  if (!data.id || !data.ws_id) return null;

  return (
    <>
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
          <DropdownMenuItem onClick={deleteSecret}>
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ModifiableDialogTrigger
        data={data}
        open={showEditDialog}
        title={t('ws-user-groups.edit')}
        editDescription={t('ws-user-groups.edit_description')}
        setOpen={setShowEditDialog}
        form={<SecretForm wsId={data.ws_id} data={data} />}
      />
    </>
  );
}
