'use client';

import { getColumns } from '../columns';
import { ExecutionDetailDialog } from './execution-detail-dialog';
import { CustomDataTable } from '@/components/custom-data-table';
import type { WorkspaceAIExecution } from '@tuturuuu/types/db';
import { useState } from 'react';

interface ExecutionsTableProps {
  executions: WorkspaceAIExecution[];
  count: number;
  locale: string;
  wsId: string;
}

export function ExecutionsTable({
  executions,
  count,
  locale,
  wsId,
}: ExecutionsTableProps) {
  const [selectedExecution, setSelectedExecution] =
    useState<WorkspaceAIExecution | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleRowClick = (execution: WorkspaceAIExecution) => {
    setSelectedExecution(execution);
    setDialogOpen(true);
  };

  return (
    <>
      <CustomDataTable
        data={executions}
        namespace="ai-execution-data-table"
        columnGenerator={getColumns}
        extraData={{
          locale,
          wsId,
          setSelectedExecutionAndOpenDialog: (
            execution: WorkspaceAIExecution
          ) => {
            setSelectedExecution(execution);
            setDialogOpen(true);
          },
        }}
        count={count}
        defaultVisibility={{ id: false }}
        onRowClick={handleRowClick}
      />

      <ExecutionDetailDialog
        execution={selectedExecution}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}
