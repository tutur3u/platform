'use client';

import ApiKeyEditDialog from './edit-dialog';
import { Row } from '@tanstack/react-table';
import { WorkspaceApiKey } from '@tutur3u/types/primitives/WorkspaceApiKey';
import { Button } from '@tutur3u/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tutur3u/ui/components/ui/dropdown-menu';
import { toast } from '@tutur3u/ui/hooks/use-toast';
import { Ellipsis } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface ApiKeyRowActionsProps {
  row: Row<WorkspaceApiKey>;
}

export function ApiKeyRowActions({ row }: ApiKeyRowActionsProps) {
  const router = useRouter();
  const t = useTranslations();

  const apiKey = row.original;

  const deleteApiKey = async () => {
    const res = await fetch(
      `/api/v1/workspaces/${apiKey.ws_id}/api-keys/${apiKey.id}`,
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

  if (!apiKey.id || !apiKey.ws_id) return null;

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
          <DropdownMenuItem onClick={deleteApiKey}>
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ApiKeyEditDialog
        data={apiKey}
        open={showEditDialog}
        setOpen={setShowEditDialog}
        submitLabel={t('ws-api-keys.edit_key')}
      />
    </>
  );
}
