'use client';

import type { Row } from '@tanstack/react-table';
import {
  BarChart,
  Ellipsis,
  Pencil,
  RefreshCcw,
  Trash2,
} from '@tuturuuu/icons';
import type { WorkspaceApiKey } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import DeleteDialog from './delete-dialog';
import ApiKeyEditDialog from './edit-dialog';
import RotateDialog from './rotate-dialog';

interface ApiKeyRowActionsProps {
  row: Row<WorkspaceApiKey>;
}

export function ApiKeyRowActions({ row }: ApiKeyRowActionsProps) {
  const t = useTranslations();
  const params = useParams();
  const wsId = params?.wsId as string;

  const apiKey = row.original;

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showRotateDialog, setShowRotateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  if (!apiKey.id || !apiKey.ws_id) return null;

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
        <DropdownMenuContent align="end" className="w-[180px]">
          <DropdownMenuItem asChild>
            <Link href={`/${wsId}/api-keys/${apiKey.id}/usage-logs`}>
              <BarChart className="h-4 w-4" />
              {t('ws-api-keys.view_usage_logs')}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setShowEditDialog(true)}>
            <Pencil className="h-4 w-4" />
            {t('common.edit')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowRotateDialog(true)}>
            <RefreshCcw className="h-4 w-4" />
            {t('ws-api-keys.rotate_key')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowDeleteDialog(true)}
            className="text-dynamic-red focus:text-dynamic-red"
          >
            <Trash2 className="h-4 w-4" />
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
      <RotateDialog
        apiKey={apiKey}
        open={showRotateDialog}
        onOpenChange={setShowRotateDialog}
      />
      <DeleteDialog
        apiKey={apiKey}
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
      />
    </>
  );
}
