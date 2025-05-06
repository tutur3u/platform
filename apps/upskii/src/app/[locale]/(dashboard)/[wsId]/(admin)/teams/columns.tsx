'use client';

import { TeamRowActions } from './row-actions';
import { TeamAccordion } from './team-accordion';
import { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { cn } from '@tuturuuu/utils/format';
import moment from 'moment';
import Link from 'next/link';

interface Team {
  id: string;
  name: string;
  created_at: string;
  member_count?: number;
  invitation_count?: number;
}

export const getTeamColumns = (
  t: any,
  _: any,
  __: any,
  extraData: {
    wsId: string;
  }
): ColumnDef<Team>[] => {
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
          href={`/${extraData.wsId}/teams/${row.getValue('id')}`}
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
        <div
          className={cn(
            'w-fit rounded border px-2 py-0.5 font-semibold',
            row.getValue('member_count') === 0
              ? 'bg-foreground/5 opacity-50'
              : 'border-dynamic-light-blue/20 bg-dynamic-light-blue/20 text-dynamic-light-blue'
          )}
        >
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
        <div
          className={cn(
            'w-fit rounded border px-2 py-0.5 font-semibold',
            row.getValue('invitation_count') === 0
              ? 'bg-foreground/5 opacity-50'
              : 'border-dynamic-light-blue/20 bg-dynamic-light-blue/20 text-dynamic-light-blue'
          )}
        >
          {row.getValue('invitation_count') || 0}
        </div>
      ),
    },
    {
      accessorKey: 'details',
      header: ({ column }) => (
        <DataTableColumnHeader
          t={t}
          column={column}
          title={t('team-tabs.overview')}
        />
      ),
      cell: ({ row }) => (
        <TeamAccordion wsId={extraData.wsId} teamId={row.getValue('id')} />
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
      cell: ({ row }) => <TeamRowActions wsId={extraData.wsId} row={row} />,
    },
  ];
};
