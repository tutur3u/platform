'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Globe, Mail } from '@tuturuuu/icons';
import type {
  BackendInfrastructureEmailBlacklistEntry,
  BackendInfrastructureEmailBlacklistEntryType,
} from '@tuturuuu/internal-api/backend';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import {
  type EmailBlacklistRowActionHandlers,
  EmailBlacklistRowActions,
} from './row-actions';

function getExtraData(extraData: unknown): EmailBlacklistRowActionHandlers {
  return extraData as EmailBlacklistRowActionHandlers;
}

export const getEmailBlacklistColumns = ({
  extraData,
  namespace,
  t,
}: ColumnGeneratorOptions<BackendInfrastructureEmailBlacklistEntry>): ColumnDef<BackendInfrastructureEmailBlacklistEntry>[] => {
  const actionHandlers = getExtraData(extraData);

  return [
    {
      accessorKey: 'id',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.id`)}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1 max-w-32 font-mono text-xs">
          {row.original.id}
        </div>
      ),
    },
    {
      accessorKey: 'entry_type',
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.entry_type`)}
        />
      ),
      cell: ({ row }) => {
        const type =
          row.getValue<BackendInfrastructureEmailBlacklistEntryType>(
            'entry_type'
          );

        return (
          <div className="flex items-center gap-2">
            {type === 'email' ? (
              <>
                <Mail className="h-4 w-4" />
                <span>{t(`${namespace}.email`)}</span>
              </>
            ) : (
              <>
                <Globe className="h-4 w-4" />
                <span>{t(`${namespace}.domain`)}</span>
              </>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'value',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.value`)}
        />
      ),
      cell: ({ row }) => (
        <div className="wrap-break-word max-w-md font-mono text-sm">
          {row.original.value}
        </div>
      ),
    },
    {
      accessorKey: 'reason',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.reason`)}
        />
      ),
      cell: ({ row }) => (
        <div className="wrap-break-word line-clamp-2 max-w-md text-sm">
          {row.original.reason || '-'}
        </div>
      ),
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.created_at`)}
        />
      ),
      cell: ({ row }) => (
        <div className="wrap-break-word line-clamp-2 max-w-32 text-sm">
          {row.original.created_at
            ? moment(row.original.created_at).format('DD/MM/YYYY, HH:mm:ss')
            : '-'}
        </div>
      ),
    },
    {
      accessorKey: 'updated_at',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.updated_at`)}
        />
      ),
      cell: ({ row }) => (
        <div className="wrap-break-word line-clamp-2 max-w-32 text-sm">
          {row.original.updated_at
            ? moment(row.original.updated_at).format('DD/MM/YYYY, HH:mm:ss')
            : '-'}
        </div>
      ),
    },
    {
      id: 'added_by',
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.added_by`)}
        />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1 max-w-32 text-sm">
          {row.original.users?.display_name || '-'}
        </div>
      ),
    },
    {
      id: 'actions',
      header: ({ column }) => <DataTableColumnHeader column={column} t={t} />,
      cell: ({ row }) => (
        <EmailBlacklistRowActions row={row.original} {...actionHandlers} />
      ),
    },
  ];
};
