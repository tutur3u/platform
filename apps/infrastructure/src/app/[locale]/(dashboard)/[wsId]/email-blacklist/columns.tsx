'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Globe, Mail } from '@tuturuuu/icons';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import { EmailBlacklistRowActions } from './row-actions';

export interface EmailBlacklistEntry {
  id: string;
  entry_type: 'email' | 'domain';
  value: string;
  reason?: string | null;
  added_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
  users?: {
    id: string;
    display_name: string | null;
  } | null;
}

export const getEmailBlacklistColumns = ({
  t,
  namespace,
}: ColumnGeneratorOptions<EmailBlacklistEntry>): ColumnDef<EmailBlacklistEntry>[] => [
  {
    accessorKey: 'id',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.id`)}
      />
    ),
    cell: ({ row }) => (
      <div className="line-clamp-1 max-w-32 font-mono text-xs">
        {row.getValue('id')}
      </div>
    ),
  },
  {
    accessorKey: 'entry_type',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.entry_type`)}
      />
    ),
    cell: ({ row }) => {
      const type = row.getValue<'email' | 'domain'>('entry_type');
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
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: 'value',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.value`)}
      />
    ),
    cell: ({ row }) => (
      <div className="wrap-break-word max-w-md font-mono text-sm">
        {row.getValue('value')}
      </div>
    ),
  },
  {
    accessorKey: 'reason',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.reason`)}
      />
    ),
    cell: ({ row }) => {
      const reason = row.getValue<string | null>('reason');
      return (
        <div className="wrap-break-word line-clamp-2 max-w-md text-sm">
          {reason || '-'}
        </div>
      );
    },
  },
  {
    accessorKey: 'created_at',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.created_at`)}
      />
    ),
    cell: ({ row }) => (
      <div className="wrap-break-word line-clamp-2 max-w-32 text-sm">
        {row.getValue('created_at')
          ? moment(row.getValue('created_at')).format('DD/MM/YYYY, HH:mm:ss')
          : '-'}
      </div>
    ),
  },
  {
    accessorKey: 'updated_at',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.updated_at`)}
      />
    ),
    cell: ({ row }) => (
      <div className="wrap-break-word line-clamp-2 max-w-32 text-sm">
        {row.getValue('updated_at')
          ? moment(row.getValue('updated_at')).format('DD/MM/YYYY, HH:mm:ss')
          : '-'}
      </div>
    ),
  },
  {
    accessorKey: 'added_by',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.added_by`)}
      />
    ),
    cell: ({ row }) => {
      const userData = row.original.users;
      return (
        <div className="line-clamp-1 max-w-32 text-sm">
          {userData?.display_name || '-'}
        </div>
      );
    },
  },
  {
    id: 'actions',
    header: ({ column }) => <DataTableColumnHeader t={t} column={column} />,
    cell: ({ row }) => <EmailBlacklistRowActions row={row} />,
  },
];
