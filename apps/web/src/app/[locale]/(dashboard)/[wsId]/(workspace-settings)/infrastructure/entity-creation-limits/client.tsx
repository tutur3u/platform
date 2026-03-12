'use client';

import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AddTableDialog } from './add-table-dialog';
import { useColumns } from './columns';
import { DataTable } from './data-table';
import { EditLimitDialog } from './edit-limit-dialog';
import type { AvailableTableRow, TableGroup } from './types';

interface Props {
  wsId: string;
  tableGroups: TableGroup[];
  availableTables: AvailableTableRow[];
}

export default function EntityCreationLimitsClient({
  wsId,
  tableGroups,
  availableTables,
}: Props) {
  const t = useTranslations('entity-creation-limits');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TableGroup | null>(null);
  const columns = useColumns(setEditing);

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">
          {t('section.configured_tables')}
        </h2>
        <Button onClick={() => setAddDialogOpen(true)}>
          {t('actions.add_table')}
        </Button>
      </div>

      <DataTable columns={columns} data={tableGroups} />

      <AddTableDialog
        wsId={wsId}
        availableTables={availableTables}
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
      />

      <EditLimitDialog
        wsId={wsId}
        group={editing}
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />
    </>
  );
}
