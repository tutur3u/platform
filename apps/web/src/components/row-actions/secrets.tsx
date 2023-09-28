'use client';

import { DotsHorizontalIcon } from '@radix-ui/react-icons';
import { Row } from '@tanstack/react-table';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '../ui/use-toast';
import { useRouter } from 'next/navigation';
import { WorkspaceSecret } from '@/types/primitives/WorkspaceSecret';
import SecretEditDialog from '@/app/(dashboard)/[wsId]/(workspace-settings)/secrets/_components/secret-edit-dialog';
import { useState } from 'react';
import useTranslation from 'next-translate/useTranslation';

interface SecretRowActionsProps {
  row: Row<WorkspaceSecret>;
}

export function SecretRowActions({ row }: SecretRowActionsProps) {
  const router = useRouter();
  const { t } = useTranslation('ws-secrets');

  const secret = row.original;

  const deleteSecret = async () => {
    const res = await fetch(
      `/api/workspaces/${secret.ws_id}/secrets/${secret.id}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      toast({
        title: 'Failed to delete API Configuration',
        description: data.message,
      });
    }
  };

  const [showEditDialog, setShowEditDialog] = useState(false);

  if (!secret.id || !secret.ws_id) return null;

  return (
    <>
      <DropdownMenu>
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
          <DropdownMenuItem
            onClick={deleteSecret}
            disabled={secret.id === undefined || secret.ws_id === undefined}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SecretEditDialog
        data={secret}
        open={showEditDialog}
        setOpen={setShowEditDialog}
        submitLabel={t('edit_secret')}
      />
    </>
  );
}
