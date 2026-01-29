'use client';

import type { ColumnDef } from '@tanstack/react-table';
import type { ProductPromotion } from '@tuturuuu/types/primitives/ProductPromotion';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import moment from 'moment';
import { PromotionRowActions } from './row-actions';

export const getPromotionColumns = ({
  t,
  namespace,
  extraData,
}: ColumnGeneratorOptions<ProductPromotion> & {
  extraData?: {
    canDeleteInventory?: boolean;
    canUpdateInventory?: boolean;
  };
}): ColumnDef<ProductPromotion>[] => [
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
    accessorKey: 'code',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.code`)}
      />
    ),
    cell: ({ row }) => <div>{row.getValue('code') || '-'}</div>,
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
    accessorKey: 'value',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t(`${namespace}.value`)}
      />
    ),
    cell: ({ row }) => <div>{row.getValue('value') || '-'}</div>,
  },
  {
    accessorKey: 'current_uses',
    header: ({ column }) => (
      <DataTableColumnHeader
        t={t}
        column={column}
        title={t('ws-inventory-promotions.form.current_uses')}
      />
    ),
    cell: ({ row }) => {
      const current = row.original.current_uses ?? 0;
      const max = row.original.max_uses;
      return (
        <div>
          {current}/
          {max === null || max === undefined
            ? t('ws-inventory-promotions.form.unlimited_uses')
            : max}
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
    cell: ({ row }) => (
      <PromotionRowActions
        row={row}
        canDeleteInventory={extraData?.canDeleteInventory}
        canUpdateInventory={extraData?.canUpdateInventory}
      />
    ),
  },
];
