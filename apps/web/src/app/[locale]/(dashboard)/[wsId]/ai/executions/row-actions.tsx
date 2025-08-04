'use client';

import type { Row } from '@tanstack/react-table';
import type { WorkspaceAIExecution } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import { Eye } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';

interface RowActionsProps {
  row: Row<WorkspaceAIExecution>;
  href?: string;
  extraData?: {
    setSelectedExecutionAndOpenDialog?: (
      execution: WorkspaceAIExecution
    ) => void;
  };
}

export function RowActions({ row, extraData }: RowActionsProps) {
  const t = useTranslations();
  const execution = row.original as WorkspaceAIExecution;

  const handleViewClick = () => {
    if (extraData?.setSelectedExecutionAndOpenDialog) {
      extraData.setSelectedExecutionAndOpenDialog(execution);
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <Button onClick={handleViewClick}>
        <Eye className="mr-1 h-5 w-5" />
        {t('common.view')}
      </Button>
    </div>
  );
}
