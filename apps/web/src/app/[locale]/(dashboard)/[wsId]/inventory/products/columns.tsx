'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Warehouse } from '@tuturuuu/icons';
import type { Product } from '@tuturuuu/types/primitives/Product';
import { Button } from '@tuturuuu/ui/button';
import type { ColumnGeneratorOptions } from '@tuturuuu/ui/custom/tables/data-table';
import { DataTableColumnHeader } from '@tuturuuu/ui/custom/tables/data-table-column-header';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import moment from 'moment';
import { ProductRowActions } from './row-actions';

const isLowStock = (s: {
  amount?: number | null;
  min_amount?: number | null;
}) =>
  s.amount !== null &&
  s.amount !== undefined &&
  s.min_amount !== null &&
  s.min_amount !== undefined &&
  s.amount < s.min_amount;

export const productColumns = ({
  t,
  namespace,
  extraData,
}: ColumnGeneratorOptions<Product> & {
  extraData?: {
    canUpdateInventory?: boolean;
    canDeleteInventory?: boolean;
    canViewStockQuantity?: boolean;
  };
}): ColumnDef<Product>[] => {
  const columns: ColumnDef<Product>[] = [
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
        <div className="line-clamp-1">{row.getValue('id')}</div>
      ),
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
  ];

  if (extraData?.canViewStockQuantity) {
    columns.push(
      {
        accessorKey: 'stock',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            t={t}
            column={column}
            title={t(`${namespace}.stock`)}
          />
        ),
        cell: ({ row }) => {
          const stock = row.original.stock || [];
          const isUnlimited = stock.some((s) => s.amount == null);

          if (isUnlimited) {
            return (
              <div className="flex items-center gap-2">
                <span className="line-clamp-1 font-medium text-dynamic-blue">
                  {t(`${namespace}.unlimited_stock`)}
                </span>
              </div>
            );
          }

          if (stock.length === 1) {
            const s = stock[0];
            if (!s) return null;

            const isLowStockStatus = isLowStock(s);

            return (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={`flex w-fit items-center gap-2 rounded-md px-2 py-1 transition-colors ${
                        isLowStockStatus
                          ? 'text-dynamic-red hover:bg-dynamic-red/10'
                          : ''
                      }`}
                    >
                      <span className="line-clamp-1 font-medium">
                        {s.amount ?? '-'} {s.unit || ''}
                      </span>
                      {isLowStockStatus && (
                        <AlertTriangle className="h-4 w-4 text-dynamic-red" />
                      )}
                    </div>
                  </TooltipTrigger>
                  {isLowStockStatus && (
                    <TooltipContent>
                      {t('ws-inventory-products.messages.stock_low_warning')}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            );
          }

          const hasLowStockInAnyWarehouse = stock.some((s) => isLowStock(s));

          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={`h-8 gap-2 px-2 ${
                          hasLowStockInAnyWarehouse ? 'text-dynamic-red' : ''
                        }`}
                        onClick={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                      >
                        <Warehouse className="h-4 w-4" />
                        <span>
                          {stock.length}
                          <span className="ml-1 hidden sm:inline">
                            {t(`${namespace}.warehouses`)}
                          </span>
                        </span>
                        {hasLowStockInAnyWarehouse && (
                          <AlertTriangle className="h-4 w-4" />
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-80 p-0"
                      align="start"
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <div className="flex flex-col gap-2 p-4">
                        <h4 className="font-medium leading-none">
                          {t(`${namespace}.stock_by_warehouse`)}
                        </h4>
                        <div className="grid gap-2">
                          {stock.map((s, idx) => {
                            const isLowStockStatus = isLowStock(s);

                            return (
                              <div
                                key={idx}
                                className="flex flex-col gap-1 border-b pb-2 last:border-b-0"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`font-medium text-sm ${
                                        isLowStockStatus
                                          ? 'text-dynamic-red'
                                          : ''
                                      }`}
                                    >
                                      {s.warehouse ||
                                        t(`${namespace}.unknown_warehouse`)}
                                    </span>
                                    {isLowStockStatus && (
                                      <AlertTriangle className="h-3 w-3 text-dynamic-red" />
                                    )}
                                  </div>
                                  <span
                                    className={`text-sm ${
                                      isLowStockStatus
                                        ? 'rounded-md px-1 font-medium text-dynamic-red hover:bg-dynamic-red/10'
                                        : ''
                                    }`}
                                  >
                                    {s.amount === null
                                      ? t(`${namespace}.unlimited_stock`)
                                      : `${s.amount ?? '-'} ${s.unit || ''}`}
                                  </span>
                                </div>
                                {s.amount !== null && (
                                  <div className="text-muted-foreground text-xs">
                                    {t(`${namespace}.min_amount`)}:{' '}
                                    {s.min_amount ?? 0} {s.unit || ''}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </TooltipTrigger>
                {hasLowStockInAnyWarehouse && (
                  <TooltipContent>
                    {t('ws-inventory-products.messages.stock_low_warning')}
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          );
        },
      },
      {
        accessorKey: 'price',
        enableSorting: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            t={t}
            column={column}
            title={t(`${namespace}.price`)}
          />
        ),
        cell: ({ row }) => {
          const stock = row.original.stock || [];
          if (stock.length === 0) return <div>-</div>;
          if (stock.length === 1) {
            const s = stock[0];
            if (!s) return null;
            return (
              <div className="flex items-center gap-2">
                <span className="line-clamp-1">
                  {s.price?.toLocaleString() ?? '-'}
                </span>
              </div>
            );
          }
          return (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-2 px-2"
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <Warehouse className="h-4 w-4" />
                  <span>
                    {stock.length}
                    <span className="ml-1 hidden sm:inline">
                      {t(`${namespace}.warehouses`)}
                    </span>
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-80 p-0"
                align="start"
                onClick={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <div className="flex flex-col gap-2 p-4">
                  <h4 className="font-medium leading-none">
                    {t(`${namespace}.price_by_warehouse`)}
                  </h4>
                  <div className="grid gap-2">
                    {stock.map((s, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between border-b pb-2 last:border-b-0"
                      >
                        <span className="font-medium text-sm">
                          {s.warehouse || t(`${namespace}.unknown_warehouse`)}
                        </span>
                        <span className="text-sm">
                          {s.price?.toLocaleString() ?? '-'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          );
        },
      }
    );
  }

  columns.push(
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
      enableSorting: false,
      cell: ({ row }) => (
        <ProductRowActions
          row={row}
          canUpdateInventory={extraData?.canUpdateInventory}
          canDeleteInventory={extraData?.canDeleteInventory}
        />
      ),
    }
  );

  return columns;
};
