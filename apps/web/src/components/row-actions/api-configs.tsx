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
import { ApiConfig } from '@/types/primitives/ApiConfig';
import ApiConfigEditDialog from '@/app/(dashboard)/[wsId]/(workspace-settings)/api/_components/api-config-edit-dialog';
import { useState } from 'react';
import useTranslation from 'next-translate/useTranslation';

interface ApiConfigRowActionsProps {
  row: Row<ApiConfig>;
}

export function ApiConfigRowActions({ row }: ApiConfigRowActionsProps) {
  const router = useRouter();
  const { t } = useTranslation('ws-api-configs');

  const apiConfig = row.original;

  const deleteApiConfig = async () => {
    const res = await fetch(
      `/api/workspaces/${apiConfig.ws_id}/api/configs/${apiConfig.id}`,
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

  if (!apiConfig.id || !apiConfig.ws_id) return null;

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
            onClick={deleteApiConfig}
            disabled={
              apiConfig.id === undefined || apiConfig.ws_id === undefined
            }
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ApiConfigEditDialog
        data={apiConfig}
        open={showEditDialog}
        setOpen={setShowEditDialog}
        submitLabel={t('edit_config')}
      />
    </>
  );
}
