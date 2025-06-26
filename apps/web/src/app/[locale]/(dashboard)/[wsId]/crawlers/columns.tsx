'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { CrawledUrl } from '@tuturuuu/types/db';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Check, X } from '@tuturuuu/ui/icons';
import moment from 'moment';
import Link from 'next/link';
import { RowActions } from './row-actions';

export const getColumns = (
  t: (key: string) => string,
  namespace: string | undefined,
  _?: unknown,
  extraData?: Record<string, unknown>
): ColumnDef<CrawledUrl>[] => [
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
      <div className="line-clamp-1 min-w-32">{row.getValue('id')}</div>
    ),
  },
  {
    accessorKey: 'url',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.url`)}
      />
    ),
    cell: ({ row }) => (
      <Link
        href={`/${extraData?.wsId ?? ''}/crawlers/${row.getValue('id')}`}
        className="min-w-16"
        rel="noreferrer"
      >
        <span className="line-clamp-1 font-semibold hover:underline">
          {row.getValue('url') || '-'}
        </span>
      </Link>
    ),
  },
  {
    accessorKey: 'html',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="HTML" />
    ),
    cell: ({ row }) => (
      <span className="line-clamp-1 font-semibold hover:underline">
        {row.getValue('html') ? <Check /> : <X />}
      </span>
    ),
  },
  {
    accessorKey: 'markdown',
    header: ({ column }) => (
      <DataTableColumnHeader t={t} column={column} title="Markdown" />
    ),
    cell: ({ row }) => (
      <span className="line-clamp-1 font-semibold hover:underline">
        {row.getValue('markdown') ? <Check /> : <X />}
      </span>
    ),
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
      <div className="min-w-32">
        {moment(row.getValue('created_at')).fromNow()}
      </div>
    ),
  },
  {
    id: 'actions',
    cell: ({ row }) => (
      <RowActions row={row} href={row.original.href} extraData={extraData} />
    ),
  },
];
