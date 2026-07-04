'use client';

import type { Row } from '@tanstack/react-table';
import { Ellipsis } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import ConfigEditDialog from './edit-dialog';
import type {
  UpdateWorkspaceReportConfig,
  WorkspaceReportConfigRow,
} from './types';

interface ConfigRowActionsProps {
  row: Row<WorkspaceReportConfigRow>;
  updateConfig: UpdateWorkspaceReportConfig;
}

export function ConfigRowActions({ row, updateConfig }: ConfigRowActionsProps) {
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
        resetMode={showResetDialog}
        setOpen={showEditDialog ? setShowEditDialog : setShowResetDialog}
        submitLabel={
          showEditDialog
            ? t('ws-reports.edit_value')
            : t('ws-reports.reset_value')
        }
        updateConfig={updateConfig}
      />
    </>
  );
}
