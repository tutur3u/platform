'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, Pencil, Save, Trash2 } from '@tuturuuu/icons';
import type { InventoryProductSummary } from '@tuturuuu/internal-api/inventory';
import {
  deleteInventoryProduct,
  updateInventoryProduct,
  updateInventoryProductInventory,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { operatorDialogContentClassName } from './operator-dialog';
import { ToggleField } from './operator-form-fields';
import { stockAmountFromRecords } from './operator-stock';

export function invalidateProducts(
  queryClient: ReturnType<typeof useQueryClient>,
  wsId: string
) {
  queryClient.invalidateQueries({ queryKey: ['inventory', wsId, 'products'] });
  queryClient.invalidateQueries({ queryKey: ['inventory', wsId, 'overview'] });
}

export function ProductRowActions({
  row,
  wsId,
}: {
  row: InventoryProductSummary;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const inventory = row.inventory?.[0] ?? {};
  const stockAmount = stockAmountFromRecords(inventory, row.stock?.[0]);
  const [stockOpen, setStockOpen] = useState(false);
  const [amount, setAmount] = useState(
    stockAmount == null ? '' : String(stockAmount)
  );
  const [minAmount, setMinAmount] = useState(String(inventory.min_amount ?? 0));
  const [price, setPrice] = useState(String(inventory.price ?? 0));
  const [unlimitedStock, setUnlimitedStock] = useState(stockAmount === null);

  const archiveMutation = useMutation({
    mutationFn: () =>
      updateInventoryProduct(wsId, row.id, {
        archived: true,
        avatar_url: row.avatar_url ?? null,
        category_id: row.category_id ?? '',
        finance_category_id: row.finance_category_id ?? null,
        manufacturer_id: row.manufacturer_id ?? null,
        name: row.name,
        owner_id: row.owner_id ?? row.owner?.id ?? '',
      }),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      toast.success(t('saveSuccess'));
      setStockOpen(false);
      invalidateProducts(queryClient, wsId);
    },
  });
  const stockMutation = useMutation({
    mutationFn: () =>
      updateInventoryProductInventory(wsId, row.id, {
        inventory: [
          {
            amount: unlimitedStock ? null : Number(amount || 0),
            min_amount: Number(minAmount || 0),
            price: Number(price || 0),
            unit_id: String(inventory.unit_id ?? ''),
            warehouse_id: String(inventory.warehouse_id ?? ''),
          },
        ],
      }),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      toast.success(t('saveSuccess'));
      invalidateProducts(queryClient, wsId);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteInventoryProduct(wsId, row.id),
    onError: () => toast.error(t('deleteError')),
    onSuccess: () => {
      toast.success(t('deleteSuccess'));
      invalidateProducts(queryClient, wsId);
    },
  });
  const canUpdateStock = Boolean(inventory.unit_id && inventory.warehouse_id);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canUpdateStock ? (
        <Dialog
          onOpenChange={(nextOpen) => {
            if (nextOpen) {
              setAmount(stockAmount == null ? '' : String(stockAmount));
              setMinAmount(String(inventory.min_amount ?? 0));
              setPrice(String(inventory.price ?? 0));
              setUnlimitedStock(stockAmount === null);
            }
            setStockOpen(nextOpen);
          }}
          open={stockOpen}
        >
          <DialogTrigger asChild>
            <Button size="sm" type="button" variant="outline">
              <Pencil className="h-4 w-4" />
              {t('editStock')}
            </Button>
          </DialogTrigger>
          <DialogContent className={operatorDialogContentClassName('compact')}>
            <DialogHeader>
              <DialogTitle>{t('editStockTitle')}</DialogTitle>
              <DialogDescription>{t('editStockDescription')}</DialogDescription>
            </DialogHeader>
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                stockMutation.mutate();
              }}
            >
              <ToggleField
                checked={unlimitedStock}
                className="items-start"
                onChange={(nextUnlimitedStock) => {
                  setUnlimitedStock(nextUnlimitedStock);
                  if (nextUnlimitedStock) setAmount('');
                }}
              >
                <span className="grid gap-1">
                  <span className="font-medium">{t('unlimitedStock')}</span>
                  <span className="text-muted-foreground text-xs">
                    {t('unlimitedStockDescription')}
                  </span>
                </span>
              </ToggleField>
              <label className="grid min-w-0 gap-1 text-sm">
                <span className="font-medium">{t('amount')}</span>
                <Input
                  disabled={unlimitedStock}
                  inputMode="numeric"
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder={
                    unlimitedStock
                      ? t('unlimitedStock')
                      : t('placeholders.amount')
                  }
                  value={amount}
                />
              </label>
              <label className="grid min-w-0 gap-1 text-sm">
                <span className="font-medium">{t('minAmount')}</span>
                <Input
                  inputMode="numeric"
                  onChange={(event) => setMinAmount(event.target.value)}
                  placeholder={t('placeholders.minAmount')}
                  value={minAmount}
                />
              </label>
              <label className="grid min-w-0 gap-1 text-sm">
                <span className="font-medium">{t('price')}</span>
                <Input
                  inputMode="numeric"
                  onChange={(event) => setPrice(event.target.value)}
                  placeholder={t('placeholders.price')}
                  value={price}
                />
              </label>
              <DialogFooter>
                <Button disabled={stockMutation.isPending} type="submit">
                  <Save className="h-4 w-4" />
                  {t('save')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
      <Button
        disabled={
          archiveMutation.isPending ||
          !row.category_id ||
          !(row.owner_id ?? row.owner?.id)
        }
        onClick={() => archiveMutation.mutate()}
        size="icon"
        type="button"
        variant="outline"
      >
        <Archive className="h-4 w-4" />
      </Button>
      <Button
        disabled={deleteMutation.isPending}
        onClick={() => deleteMutation.mutate()}
        size="icon"
        type="button"
        variant="destructive"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
