'use client';

import SecretEditDialog from '@/app/[locale]/(dashboard)/[wsId]/(workspace-settings)/secrets/_components/secret-edit-dialog';
import { WorkspaceSecret } from '@/types/primitives/WorkspaceSecret';
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

interface SecretRowActionsProps {
  row: Row<WorkspaceSecret>;
}

export function SecretRowActions({ row }: SecretRowActionsProps) {
  const router = useRouter();
  const t = useTranslations();

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
        title: 'Failed to delete workspace secret',
        description: data.message,
      });
    }
  };

  const [showEditDialog, setShowEditDialog] = useState(false);

  if (!secret.id || !secret.ws_id) return null;

  return (
    <>
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
          <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
            {t('common.edit')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={deleteSecret}>
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SecretEditDialog
        data={secret}
        open={showEditDialog}
        setOpen={setShowEditDialog}
        submitLabel={t('ws-secrets.edit_secret')}
      />
    </>
  );
}
