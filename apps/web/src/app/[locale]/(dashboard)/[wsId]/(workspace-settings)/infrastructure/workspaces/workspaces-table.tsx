'use client';

import type { WorkspaceOverviewRow } from '@tuturuuu/types';
import { CustomDataTable } from '@tuturuuu/ui/custom/tables/custom-data-table';
import { useState } from 'react';
import { workspaceOverviewColumns } from './columns';
import Filters from './filters';
import { WorkspaceDetailDialog } from './workspace-detail-dialog';

interface Props {
  data: WorkspaceOverviewRow[];
  count: number;
}

export function WorkspacesTable({ data, count }: Props) {
  const [selected, setSelected] = useState<WorkspaceOverviewRow | null>(null);

  return (
    <>
      <CustomDataTable
        data={data}
        namespace="ws-overview"
        columnGenerator={workspaceOverviewColumns}
        count={count}
        defaultVisibility={{
          id: false,
          creator_id: false,
          secret_count: false,
        }}
        filters={<Filters />}
        onRowClick={setSelected}
      />
      <WorkspaceDetailDialog
        workspace={selected}
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </>
  );
}
