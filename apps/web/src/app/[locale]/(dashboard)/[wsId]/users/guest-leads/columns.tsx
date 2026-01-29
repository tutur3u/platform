'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { Mail } from '@tuturuuu/icons';
import type { GuestUserLead } from '@tuturuuu/types/primitives/GuestUserLead';
import { Button } from '@tuturuuu/ui/button';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import Link from 'next/link';

export const getGuestLeadColumns = ({
  t,
  namespace,
}: ColumnGeneratorOptions<GuestUserLead>): ColumnDef<GuestUserLead>[] => [
  {
    accessorKey: 'id',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.id`)}
      />
    ),
    cell: ({ row }) => <div className="line-clamp-1">{row.getValue('id')}</div>,
  },
  {
    accessorKey: 'full_name',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.full_name`)}
      />
    ),
    cell: ({ row }) => <div>{row.getValue('full_name') || '-'}</div>,
  },
  {
    accessorKey: 'email',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.email`)}
      />
    ),
    cell: ({ row }) => <div>{row.getValue('email') || '-'}</div>,
  },
  {
    accessorKey: 'phone',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.phone`)}
      />
    ),
    cell: ({ row }) => <div>{row.getValue('phone') || '-'}</div>,
  },
  {
    accessorKey: 'attendance_count',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.attendance_count`)}
      />
    ),
    cell: ({ row }) => (
      <div className="text-center">
        <span className="inline-flex items-center rounded-full bg-dynamic-green/10 px-2 py-1 font-medium text-dynamic-green text-xs">
          {row.getValue('attendance_count')}
        </span>
      </div>
    ),
  },
  {
    accessorKey: 'group_name',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.group`)}
      />
    ),
    cell: ({ row }) => <div>{row.getValue('group_name') || '-'}</div>,
  },
  {
    accessorKey: 'has_lead_generation',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.status`)}
      />
    ),
    cell: ({ row }) => {
      const hasLead = row.getValue('has_lead_generation') as boolean;
      return (
        <div className="text-center">
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 font-medium text-xs ${
              hasLead
                ? 'bg-dynamic-blue/10 text-dynamic-blue'
                : 'bg-dynamic-orange/10 text-dynamic-orange'
            }`}
          >
            {hasLead ? t('common.contacted') : t('common.pending')}
          </span>
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
      <div>
        {row.getValue('created_at')
          ? moment(row.getValue('created_at')).format('DD/MM/YYYY, HH:mm:ss')
          : '-'}
      </div>
    ),
  },
  {
    id: 'actions',
    header: t(`${namespace}.actions`),
    cell: ({ row }) => {
      const user = row.original;
      const hasLead = user.has_lead_generation;

      return (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={hasLead ? 'outline' : 'default'}
            className={
              hasLead
                ? 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue hover:bg-dynamic-blue/15'
                : 'bg-dynamic-orange hover:bg-dynamic-orange/90'
            }
            asChild
          >
            <Link href={`./${user.id}/follow-up`}>
              <Mail className="mr-1 h-4 w-4" />
              {hasLead ? t('common.view_email') : t('common.send_email')}
            </Link>
          </Button>
        </div>
      );
    },
  },
];
