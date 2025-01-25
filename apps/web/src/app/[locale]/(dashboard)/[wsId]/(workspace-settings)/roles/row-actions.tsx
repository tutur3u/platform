'use client';

import { RoleForm } from './form';
import { WorkspaceRole } from '@/types/db';
import type { SupabaseUser } from '@repo/supabase/next/user';
import { Button } from '@repo/ui/components/ui/button';
import ModifiableDialogTrigger from '@repo/ui/components/ui/custom/modifiable-dialog-trigger';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@repo/ui/components/ui/dropdown-menu';
import { toast } from '@repo/ui/hooks/use-toast';
import { Row } from '@tanstack/react-table';
import { Ellipsis, Pencil } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface RoleRowActionsProps {
  row: Row<WorkspaceRole>;
}

export function RoleRowActions({ row }: RoleRowActionsProps) {
  const router = useRouter();
  const t = useTranslations();

  const data = row.original;

  const deleteRole = async () => {
    const res = await fetch(
      `/api/v1/workspaces/${data.ws_id}/roles/${data.id}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      toast({
        title: 'Failed to delete workspace role',
        description: data.message,
      });
    }
  };

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
            className="data-[state=open]:bg-muted flex h-8 w-8 p-0"
          >
            <Ellipsis className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          <DropdownMenuItem onClick={deleteRole}>
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
