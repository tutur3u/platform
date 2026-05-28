'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { InventoryManufacturer } from '@tuturuuu/internal-api';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import { ProductManufacturerRowActions } from './row-actions';

export const productManufacturerColumns = ({
  t,
  namespace,
  extraData,
}: ColumnGeneratorOptions<InventoryManufacturer> & {
  extraData?: {
    canDeleteInventory?: boolean;
    canUpdateInventory?: boolean;
  };
}): ColumnDef<InventoryManufacturer>[] => [
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
    cell: ({ row }) => (
      <ProductManufacturerRowActions
        row={row}
        canDeleteInventory={extraData?.canDeleteInventory}
        canUpdateInventory={extraData?.canUpdateInventory}
      />
    ),
  },
];
