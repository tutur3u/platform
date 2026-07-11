'use client';

import {
  AlertCircle,
  MoreHorizontal,
  Pencil,
  RulerDimensionLine,
  Trash2,
  Warehouse,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';
import type { LinkedProduct } from './use-linked-products';

interface LinkedProductItemProps {
  product: LinkedProduct;
  warehouseName: string | null;
  unitName: string | null;
  canUpdate: boolean;
  onEdit: (product: LinkedProduct) => void;
  onDelete: (product: LinkedProduct) => void;
}

export function LinkedProductItem({
  product,
  warehouseName,
  unitName,
  canUpdate,
  onEdit,
  onDelete,
}: LinkedProductItemProps) {
  const t = useTranslations();

  const missingWarehouse = !product.warehouse_id;
  const missingUnit = !product.unit_id;
  const hasMissing = missingWarehouse || missingUnit;

  return (
    <div className="group flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-card/40 p-4 transition-all duration-200 hover:border-border hover:bg-card/80 hover:shadow-sm">
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-foreground text-sm">
          {product.name}
        </div>
        {product.description && (
          <div className="mt-0.5 line-clamp-2 text-muted-foreground text-xs">
            {product.description}
          </div>
        )}
        {hasMissing && (
          <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1 font-medium text-destructive text-xs">
            <AlertCircle className="h-3 w-3" />
            {missingWarehouse && t('ws-groups.missing_warehouse')}
            {missingWarehouse && missingUnit ? ' • ' : ''}
            {missingUnit && t('ws-groups.missing_unit')}
          </div>
        )}
        {!hasMissing && (warehouseName || unitName) && (
          <div className="mt-2 flex flex-col gap-1 text-muted-foreground text-xs">
            {warehouseName && (
              <div className="flex items-center gap-1.5">
                <Warehouse className="h-3.5 w-3.5" />
                <span className="sr-only">
                  {t('ws-inventory-warehouses.singular')}
                </span>
                <span className="font-medium">{warehouseName}</span>
              </div>
            )}
            {unitName && (
              <div className="flex items-center gap-1.5">
                <RulerDimensionLine className="h-3.5 w-3.5" />
                <span className="sr-only">
                  {t('ws-inventory-units.singular')}
                </span>
                <span className="font-medium">{unitName}</span>
              </div>
            )}
          </div>
        )}
      </div>
      {canUpdate && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 flex-shrink-0 opacity-60 transition-opacity group-hover:opacity-100"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onClick={() => onEdit(product)}
              className="cursor-pointer"
            >
              <Pencil className="mr-2 h-4 w-4" />
              {t('ws-groups.edit_product')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDelete(product)}
              className="cursor-pointer text-dynamic-red"
            >
              <Trash2 className="mr-2 h-4 w-4 text-dynamic-red" />
              {t('ws-groups.remove_product')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
