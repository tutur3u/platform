'use client';

import { Trash2 } from '@tuturuuu/icons';
import type { InventoryProductSummary } from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { currency } from './operator-format';

export type SaleStockOption = {
  amount: number | null;
  financeCategoryId: string | null;
  key: string;
  price: number;
  productId: string;
  productName: string;
  unitId: string;
  unitName: string;
  warehouseId: string;
  warehouseName: string;
};

export type SaleCartLine = SaleStockOption & { quantity: number };

export function CartEditor({
  currencyCode,
  lines,
  onChange,
}: {
  currencyCode: string;
  lines: SaleCartLine[];
  onChange: (lines: SaleCartLine[]) => void;
}) {
  const t = useTranslations('inventory.operator.commerce.createSale');
  return (
    <aside className="grid min-w-0 content-start gap-3 rounded-xl border bg-muted/15 p-3">
      <p className="font-semibold text-sm">{t('cart')}</p>
      {lines.map((line) => (
        <div
          className="grid gap-2 rounded-lg border bg-background p-3"
          key={line.key}
        >
          <div className="flex min-w-0 items-start gap-2">
            <p className="min-w-0 flex-1 truncate font-medium text-sm">
              {line.productName}
            </p>
            <Button
              aria-label={t('removeItem', { name: line.productName })}
              onClick={() =>
                onChange(lines.filter((item) => item.key !== line.key))
              }
              className="h-10 w-10 touch-manipulation sm:h-9 sm:w-9"
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              aria-label={t('quantity')}
              inputMode="numeric"
              max={line.amount ?? undefined}
              min={1}
              onChange={(event) =>
                onChange(
                  lines.map((item) =>
                    item.key === line.key
                      ? {
                          ...item,
                          quantity: Math.max(
                            1,
                            Math.min(
                              Number(event.target.value) || 1,
                              item.amount ?? Number.MAX_SAFE_INTEGER
                            )
                          ),
                        }
                      : item
                  )
                )
              }
              step={1}
              type="number"
              value={line.quantity}
            />
            <Input
              aria-label={t('unitPrice')}
              inputMode="decimal"
              min={0}
              onChange={(event) =>
                onChange(
                  lines.map((item) =>
                    item.key === line.key
                      ? {
                          ...item,
                          price: Math.max(0, Number(event.target.value) || 0),
                        }
                      : item
                  )
                )
              }
              step="0.01"
              type="number"
              value={line.price}
            />
          </div>
          <p className="text-right font-medium text-xs tabular-nums">
            {currency(line.price * line.quantity, currencyCode)}
          </p>
        </div>
      ))}
      {lines.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-muted-foreground text-sm">
          {t('emptyCart')}
        </p>
      ) : null}
    </aside>
  );
}

export function getSaleStockOptions(
  products: InventoryProductSummary[]
): SaleStockOption[] {
  return products.flatMap((product) => {
    if (product.archived) return [];
    return (product.inventory ?? []).flatMap((raw) => {
      const unitId = typeof raw.unit_id === 'string' ? raw.unit_id : '';
      const warehouseId =
        typeof raw.warehouse_id === 'string' ? raw.warehouse_id : '';
      if (!unitId || !warehouseId) return [];
      return [
        {
          amount: typeof raw.amount === 'number' ? raw.amount : null,
          financeCategoryId: product.finance_category_id ?? null,
          key: `${product.id}:${unitId}:${warehouseId}`,
          price: typeof raw.price === 'number' ? raw.price : 0,
          productId: product.id,
          productName: product.name,
          unitId,
          unitName: typeof raw.unit_name === 'string' ? raw.unit_name : 'Unit',
          warehouseId,
          warehouseName:
            typeof raw.warehouse_name === 'string'
              ? raw.warehouse_name
              : 'Warehouse',
        },
      ];
    });
  });
}
