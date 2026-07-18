'use client';

import { CircleDollarSign, Hash, Package, Trash2 } from '@tuturuuu/icons';
import type { InventoryProductSummary } from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { CurrencyInput } from '@tuturuuu/ui/currency-input';
import { Input } from '@tuturuuu/ui/input';
import { getCurrencyLocale } from '@tuturuuu/utils/format';
import { getCurrencyFractionDigits } from '@tuturuuu/utils/money';
import { useTranslations } from 'next-intl';
import { currency } from './operator-format';

export type SaleStockOption = {
  amount: number | null;
  categoryId: string | null;
  categoryName: string | null;
  financeCategoryId: string | null;
  imageUrl: string | null;
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

export function updateSaleCartQuantity(
  lines: SaleCartLine[],
  option: SaleStockOption,
  requestedQuantity: number
) {
  const quantity = Math.max(
    0,
    Math.min(
      Math.floor(requestedQuantity),
      option.amount ?? Number.MAX_SAFE_INTEGER
    )
  );

  if (quantity === 0) {
    return lines.filter((line) => line.key !== option.key);
  }

  const existing = lines.some((line) => line.key === option.key);
  return existing
    ? lines.map((line) =>
        line.key === option.key ? { ...line, quantity } : line
      )
    : [...lines, { ...option, quantity }];
}

export function CartEditor({
  currencyCode,
  lines,
  onChange,
  showUnitOnMobile,
  showWarehouseOnMobile,
}: {
  currencyCode: string;
  lines: SaleCartLine[];
  onChange: (lines: SaleCartLine[]) => void;
  showUnitOnMobile: boolean;
  showWarehouseOnMobile: boolean;
}) {
  const t = useTranslations('inventory.operator.commerce.createSale');
  return (
    <aside className="grid min-w-0 content-start gap-2 rounded-xl border bg-muted/15 p-2 sm:gap-3 sm:p-3">
      <p className="font-semibold text-sm">{t('cart')}</p>
      {lines.map((line) => (
        <div
          className="grid gap-2 rounded-lg border bg-background p-2 sm:p-3"
          key={line.key}
        >
          <div className="flex min-w-0 items-start gap-2">
            <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted/40 sm:h-10 sm:w-10">
              {line.imageUrl ? (
                // biome-ignore lint/performance/noImgElement: workspace media can be a signed first-party URL.
                <img
                  alt=""
                  className="h-full w-full object-cover"
                  src={line.imageUrl}
                />
              ) : (
                <Package className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-sm">{line.productName}</p>
              {showUnitOnMobile || showWarehouseOnMobile ? (
                <p className="truncate text-muted-foreground text-xs sm:hidden">
                  {showUnitOnMobile ? line.unitName : null}
                  {showUnitOnMobile && showWarehouseOnMobile ? ' · ' : null}
                  {showWarehouseOnMobile ? line.warehouseName : null}
                </p>
              ) : null}
              <p className="hidden truncate text-muted-foreground text-xs sm:block">
                {line.unitName} · {line.warehouseName}
              </p>
            </div>
            <Button
              aria-label={t('removeItem', { name: line.productName })}
              onClick={() =>
                onChange(lines.filter((item) => item.key !== line.key))
              }
              className="h-8 w-8 touch-manipulation sm:h-9 sm:w-9"
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-muted-foreground text-xs">
              <span className="flex items-center gap-1">
                <Hash className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only">{t('quantity')}</span>
              </span>
              <Input
                aria-label={t('quantity')}
                className="h-9 text-sm"
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
            </label>
            <label className="grid gap-1 text-muted-foreground text-xs">
              <span className="flex items-center gap-1">
                <CircleDollarSign className="h-3.5 w-3.5" />
                <span className="sr-only sm:not-sr-only">{t('unitPrice')}</span>
              </span>
              <CurrencyInput
                aria-label={t('unitPrice')}
                className="h-9 text-sm"
                currencySuffix={currencyCode.toUpperCase()}
                hideHelpers
                locale={getCurrencyLocale(currencyCode)}
                maximumFractionDigits={getCurrencyFractionDigits(currencyCode)}
                onChange={(value) =>
                  onChange(
                    lines.map((item) =>
                      item.key === line.key
                        ? {
                            ...item,
                            price: Math.max(0, value || 0),
                          }
                        : item
                    )
                  )
                }
                value={line.price}
              />
            </label>
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
          categoryId: product.category_id ?? null,
          categoryName: product.category ?? null,
          financeCategoryId: product.finance_category_id ?? null,
          imageUrl: product.avatar_url ?? null,
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
