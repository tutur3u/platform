'use client';

import type { ColumnGenerator } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import type {
  InventoryNamedResourceKind,
  InventoryNamedResourceRow,
} from './inventory-named-resource-form';
import { InventoryNamedResourceRowActions } from './inventory-named-resource-row-actions';

type InventoryMutationPermissions = {
  canDeleteInventory?: boolean;
  canUpdateInventory?: boolean;
  kind?: InventoryNamedResourceKind;
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

export const inventoryNamedResourceColumns: ColumnGenerator<
  InventoryNamedResourceRow
> = ({ extraData, namespace = 'basic-data-table', t }) => {
  const permissions = extraData as InventoryMutationPermissions | undefined;
  const kind = permissions?.kind ?? 'categories';

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
        <InventoryNamedResourceRowActions
          canDeleteInventory={permissions?.canDeleteInventory}
          canUpdateInventory={permissions?.canUpdateInventory}
          data={row.original}
          kind={kind}
        />
      ),
      id: 'actions',
    },
  ];
};
