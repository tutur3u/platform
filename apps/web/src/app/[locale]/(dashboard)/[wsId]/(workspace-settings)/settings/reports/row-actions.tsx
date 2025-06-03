'use client';

import ConfigEditDialog from './edit-dialog';
import { WorkspaceConfig } from '@ncthub/types/primitives/WorkspaceConfig';
import { Button } from '@ncthub/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ncthub/ui/dropdown-menu';
import { Ellipsis } from '@ncthub/ui/icons';
import { Row } from '@tanstack/react-table';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface ConfigRowActionsProps {
  row: Row<WorkspaceConfig>;
}

export function ConfigRowActions({ row }: ConfigRowActionsProps) {
  const t = useTranslations();
  const config = row.original;

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);

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
          {config.value && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowResetDialog(true)}>
                {t('common.reset')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfigEditDialog
        data={
          showResetDialog
            ? {
                ...config,
                value: '',
              }
            : config
        }
        open={showEditDialog || showResetDialog}
        setOpen={showEditDialog ? setShowEditDialog : setShowResetDialog}
        resetMode={showResetDialog}
        submitLabel={
          showEditDialog
            ? t('ws-reports.edit_value')
            : t('ws-reports.reset_value')
        }
      />
    </>
  );
}
