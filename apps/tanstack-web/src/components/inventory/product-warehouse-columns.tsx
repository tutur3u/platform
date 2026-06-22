'use client';

import type { ProductWarehouse } from '@tuturuuu/types/primitives/ProductWarehouse';
import type { ColumnGenerator } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { ProductWarehouseRowActions } from './product-warehouse-row-actions';

type InventoryMutationPermissions = {
  canDeleteInventory?: boolean;
  canUpdateInventory?: boolean;
};

type ProductWarehouseRow = ProductWarehouse & {
  created_at?: string | null;
};

const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
  month: '2-digit',
  second: '2-digit',
  year: 'numeric',
});

function formatDateTime(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }

  return dateTimeFormatter.format(date);
}

function formatText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : '-';
}

export const productWarehouseColumns: ColumnGenerator<ProductWarehouseRow> = ({
  extraData,
  namespace = 'basic-data-table',
  t,
}) => {
  const permissions = extraData as InventoryMutationPermissions | undefined;

  return [
    {
      accessorKey: 'id',
      cell: ({ row }) => (
        <div className="line-clamp-1">{formatText(row.getValue('id'))}</div>
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
      cell: ({ row }) => <div>{formatText(row.getValue('name'))}</div>,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.name`)}
        />
      ),
    },
    {
      accessorKey: 'created_at',
      cell: ({ row }) => (
        <div>{formatDateTime(row.getValue('created_at'))}</div>
      ),
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          t={t}
          title={t(`${namespace}.created_at`)}
        />
      ),
    },
    {
      cell: ({ row }) => (
        <ProductWarehouseRowActions
          canDeleteInventory={permissions?.canDeleteInventory}
          canUpdateInventory={permissions?.canUpdateInventory}
          data={row.original}
        />
      ),
      id: 'actions',
    },
  ];
};
