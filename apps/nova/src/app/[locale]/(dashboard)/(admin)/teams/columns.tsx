'use client';

import { TeamRowActions } from './row-actions';
import { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import Link from 'next/link';

interface Team {
  id: string;
  name: string;
  created_at: string;
  member_count?: number;
  invitation_count?: number;
}

export const getTeamColumns = (t: any): ColumnDef<Team>[] => {
  return [
    {
      accessorKey: 'id',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title="ID" />
      ),
      cell: ({ row }) => (
        <div className="line-clamp-1">{row.getValue('id')}</div>
      ),
    },
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <DataTableColumnHeader t={t} column={column} title={t('common.name')} />
      ),
      cell: ({ row }) => (
        <Link
          href={`/teams/${row.getValue('id')}`}
          className="line-clamp-1 font-semibold hover:underline"
        >
          {row.getValue('name')}
        </Link>
      ),
    },
    {
      accessorKey: 'member_count',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t('teams.members')}
        />
      ),
      cell: ({ row }) => (
        <div className="w-fit rounded border bg-foreground/5 px-2 py-0.5 font-semibold">
          {row.getValue('member_count') || 0}
        </div>
      ),
    },
    {
      accessorKey: 'invitation_count',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t('teams.invitations')}
        />
      ),
      cell: ({ row }) => (
        <div className="w-fit rounded border bg-foreground/5 px-2 py-0.5 font-semibold">
          {row.getValue('invitation_count') || 0}
        </div>
      ),
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t(`common.created_at`)}
        />
      ),
      cell: ({ row }) => (
        <div>
          {row.getValue('created_at')
            ? moment(row.getValue('created_at')).format('DD/MM/YYYY, HH:mm:ss')
            : '-'}
        </div>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => <TeamRowActions row={row} />,
    },
  ];
};
