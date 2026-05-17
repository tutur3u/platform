'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Row } from '@tanstack/react-table';
import { Ellipsis, Pencil } from '@tuturuuu/icons';
import { deleteWorkspaceRole } from '@tuturuuu/internal-api/settings';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { WorkspaceRole } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import ModifiableDialogTrigger from '@tuturuuu/ui/custom/modifiable-dialog-trigger';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { RoleForm } from './form';

interface RoleRowActionsProps {
  row: Row<WorkspaceRole>;
}

export function RoleRowActions({ row }: RoleRowActionsProps) {
  const queryClient = useQueryClient();
  const t = useTranslations();

  const data = row.original;

  const deleteRoleMutation = useMutation({
    mutationFn: () => deleteWorkspaceRole(data.ws_id ?? '', data.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['workspace-roles', data.ws_id],
      });
    },
    onError: (error) => {
      toast({
        title: t('ws-roles.delete_failed'),
        description:
          error instanceof Error ? error.message : t('common.500-msg'),
      });
    },
  });

  const [showEditDialog, setShowEditDialog] = useState(false);

  if (!data.id || !data.ws_id) return null;

  return (
    <div className="flex items-center justify-end gap-2">
      <Button onClick={() => setShowEditDialog(true)}>
        <Pencil className="mr-1 h-5 w-5" />
        {t('common.edit')}
      </Button>

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
          <DropdownMenuItem onClick={() => deleteRoleMutation.mutate()}>
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ModifiableDialogTrigger
        data={data}
        open={showEditDialog}
        title={t('ws-roles.edit')}
        editDescription={t('ws-roles.edit_description')}
        setOpen={setShowEditDialog}
        form={
          <RoleForm
            wsId={data.ws_id}
            user={{} as unknown as SupabaseUser}
            data={data}
          />
        }
        requireExpansion
      />
    </div>
  );
}
