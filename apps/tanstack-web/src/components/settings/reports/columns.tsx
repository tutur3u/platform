'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import { ConfigRowActions } from './row-actions';
import type {
  UpdateWorkspaceReportConfig,
  WorkspaceReportConfigRow,
} from './types';

type ReportsTableExtraData = {
  updateConfig: UpdateWorkspaceReportConfig;
};

export const configColumns = ({
  extraData,
  namespace,
  t,
}: ColumnGeneratorOptions<WorkspaceReportConfigRow>): ColumnDef<WorkspaceReportConfigRow>[] => {
  const { updateConfig } = extraData as ReportsTableExtraData;

  return [
    {
      accessorKey: 'id',
      cell: ({ row }) => (
        <div className="line-clamp-1 break-all">{row.getValue('id')}</div>
      ),
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.id`)}
        />
      ),
    },
    {
      accessorKey: 'name',
      cell: ({ row }) => (
        <div className="line-clamp-1 break-all">
          {row.getValue('name') || '-'}
        </div>
      ),
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.name`)}
        />
      ),
    },
    {
      accessorKey: 'value',
      cell: ({ row }) => (
        <div className="line-clamp-1 max-w-[24rem] break-all">
          {row.getValue('value') || '-'}
        </div>
      ),
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.value`)}
        />
      ),
    },
    {
      accessorKey: 'updated_at',
      cell: ({ row }) => (
        <div className="line-clamp-2 max-w-32 break-all">
          {row.getValue('updated_at')
            ? moment(row.getValue('updated_at')).format('DD/MM/YYYY, HH:mm:ss')
            : '-'}
        </div>
      ),
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.updated_at`)}
        />
      ),
    },
    {
      cell: ({ row }) => (
        <ConfigRowActions row={row} updateConfig={updateConfig} />
      ),
      header: ({ column }) => <DataTableColumnHeader column={column} t={t} />,
      id: 'actions',
    },
  ];
};
