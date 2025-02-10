'use client';

import { ProductRowActions } from './row-actions';
import { ColumnDef } from '@tanstack/react-table';
import { Product } from '@tutur3u/types/primitives/Product';
import { DataTableColumnHeader } from '@tutur3u/ui/components/ui/custom/tables/data-table-column-header';
import moment from 'moment';

export const productColumns = (
  t: any,
  namespace: string | undefined
): ColumnDef<Product>[] => [
  // {
  //   id: 'select',
  //   header: ({ table }) => (
  //     <Checkbox
  //       checked={table.getIsAllPageRowsSelected()}
  //       onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
  //       aria-label="Select all"
  //       className="translate-y-[2px]"
  //     />
  //   ),
  //   cell: ({ row }) => (
  //     <Checkbox
  //       checked={row.getIsSelected()}
  //       onCheckedChange={(value) => row.toggleSelected(!!value)}
  //       aria-label="Select row"
  //       className="translate-y-[2px]"
  //     />
  //   ),
  //   enableSorting: false,
  //   enableHiding: false,
  // },
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
    accessorKey: 'name',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.name`)}
      />
    ),
    cell: ({ row }) => <div>{row.getValue('name') || '-'}</div>,
  },
  {
    accessorKey: 'category',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.category`)}
      />
    ),
    cell: ({ row }) => <div>{row.getValue('category') || '-'}</div>,
  },
  {
    accessorKey: 'description',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.description`)}
      />
    ),
    cell: ({ row }) => <div>{row.getValue('description') || '-'}</div>,
  },
  {
    accessorKey: 'manufacturer',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.manufacturer`)}
      />
    ),
    cell: ({ row }) => <div>{row.getValue('manufacturer') || '-'}</div>,
  },
  {
    accessorKey: 'usage',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.usage`)}
      />
    ),
    cell: ({ row }) => <div>{row.getValue('usage') || '-'}</div>,
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
    cell: ({ row }) => <ProductRowActions row={row} />,
  },
];
