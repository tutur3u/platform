'use client';

import type { ProductBatch } from '@tuturuuu/types/primitives/ProductBatch';
import type { ColumnGenerator } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';

const currencyFormatter = new Intl.NumberFormat('vi-VN', {
  currency: 'VND',
  style: 'currency',
});

const dateTimeFormatter = new Intl.DateTimeFormat('vi-VN', {
  day: '2-digit',
  hour: '2-digit',
  hour12: false,
  minute: '2-digit',
  month: '2-digit',
  second: '2-digit',
  year: 'numeric',
});

function formatCurrency(value: unknown) {
  return currencyFormatter.format(typeof value === 'number' ? value : 0);
}

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

export const batchColumns: ColumnGenerator<ProductBatch> = ({
  namespace = 'batch-data-table',
  t,
}) => [
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
    accessorKey: 'price',
    cell: ({ row }) => <div>{formatCurrency(row.getValue('price'))}</div>,
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        t={t}
        title={t(`${namespace}.price`)}
      />
    ),
  },
  {
    accessorKey: 'total_diff',
    cell: ({ row }) => <div>{formatCurrency(row.getValue('total_diff'))}</div>,
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        t={t}
        title={t(`${namespace}.total_diff`)}
      />
    ),
  },
  {
    accessorKey: 'warehouse',
    cell: ({ row }) => <div>{formatText(row.getValue('warehouse'))}</div>,
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        t={t}
        title={t(`${namespace}.warehouse`)}
      />
    ),
  },
  {
    accessorKey: 'supplier',
    cell: ({ row }) => <div>{formatText(row.getValue('supplier'))}</div>,
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        t={t}
        title={t(`${namespace}.supplier`)}
      />
    ),
  },
  {
    accessorKey: 'created_at',
    cell: ({ row }) => <div>{formatDateTime(row.getValue('created_at'))}</div>,
    header: ({ column }) => (
      <DataTableColumnHeader
        column={column}
        t={t}
        title={t(`${namespace}.created_at`)}
      />
    ),
  },
];
