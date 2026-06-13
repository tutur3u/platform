'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Layers3, Plus, Trash2 } from '@tuturuuu/icons';
import type { InventoryProductFormOptionsResponse } from '@tuturuuu/internal-api/inventory';
import {
  createInventoryBatch,
  deleteInventoryBatch,
} from '@tuturuuu/internal-api/inventory';
import type { ProductBatch } from '@tuturuuu/types/primitives/ProductBatch';
import type { ProductSupplier } from '@tuturuuu/types/primitives/ProductSupplier';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { EmptyRow } from './operator-shell';
import {
  EMPTY_SELECT_VALUE,
  invalidateSetup,
  namedRows,
} from './setup-helpers';

function BatchCreateDialog({
  options,
  suppliers,
  wsId,
}: {
  options?: InventoryProductFormOptionsResponse;
  suppliers: ProductSupplier[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [price, setPrice] = useState('');
  const createMutation = useMutation({
    mutationFn: () =>
      createInventoryBatch(wsId, {
        price: Number(price || 0),
        supplier_id: supplierId || null,
        warehouse_id: warehouseId,
      }),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      setPrice('');
      setSupplierId('');
      setWarehouseId('');
      setOpen(false);
      toast.success(t('saveSuccess'));
      invalidateSetup(queryClient, wsId);
    },
  });

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button size="sm" type="button">
          <Plus className="h-4 w-4" />
          {t('create')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] w-[min(calc(100vw-2rem),36rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('createBatchTitle')}</DialogTitle>
          <DialogDescription>{t('createBatchDescription')}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (warehouseId) createMutation.mutate();
          }}
        >
          <label className="grid min-w-0 gap-1 text-sm">
            <span className="font-medium">{t('warehouse')}</span>
            <Select
              onValueChange={(value) =>
                setWarehouseId(value === EMPTY_SELECT_VALUE ? '' : value)
              }
              value={warehouseId || EMPTY_SELECT_VALUE}
            >
              <SelectTrigger className="min-w-0">
                <SelectValue placeholder={t('placeholders.warehouse')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EMPTY_SELECT_VALUE}>
                  {t('placeholders.warehouse')}
                </SelectItem>
                {options?.warehouses.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="grid min-w-0 gap-1 text-sm">
            <span className="font-medium">{t('supplier')}</span>
            <Select
              onValueChange={(value) =>
                setSupplierId(value === EMPTY_SELECT_VALUE ? '' : value)
              }
              value={supplierId || EMPTY_SELECT_VALUE}
            >
              <SelectTrigger className="min-w-0">
                <SelectValue placeholder={t('placeholders.supplier')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EMPTY_SELECT_VALUE}>
                  {t('placeholders.supplier')}
                </SelectItem>
                {namedRows(suppliers).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Button
              disabled={!warehouseId || createMutation.isPending}
              type="submit"
            >
              {t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BatchRow({
  batch,
  wsId,
}: {
  batch: ProductBatch & { id: string };
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const deleteMutation = useMutation({
    mutationFn: () => deleteInventoryBatch(wsId, batch.id),
    onError: () => toast.error(t('deleteError')),
    onSuccess: () => {
      toast.success(t('deleteSuccess'));
      invalidateSetup(queryClient, wsId);
    },
  });

  return (
    <div className="grid min-w-0 gap-2 border-border border-t p-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
      <div className="min-w-0">
        <p className="truncate font-medium">
          {batch.warehouse ?? batch.warehouse_id}
        </p>
        <p className="truncate text-muted-foreground text-xs">
          {batch.supplier ?? batch.id}
        </p>
      </div>
      <span>{batch.price ?? 0}</span>
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

export function BatchSection({
  batches,
  options,
  suppliers,
  wsId,
}: {
  batches: ProductBatch[];
  options?: InventoryProductFormOptionsResponse;
  suppliers: ProductSupplier[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid min-w-0 gap-3 border-border border-b px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Layers3 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-sm">{t('batch')}</p>
            <p className="text-muted-foreground text-xs">{batches.length}</p>
          </div>
        </div>
        <BatchCreateDialog
          options={options}
          suppliers={suppliers}
          wsId={wsId}
        />
      </div>
      {batches.length ? (
        batches
          .filter((batch): batch is ProductBatch & { id: string } =>
            Boolean(batch.id)
          )
          .map((batch) => <BatchRow batch={batch} key={batch.id} wsId={wsId} />)
      ) : (
        <div className="p-3">
          <EmptyRow label={t('emptyResource')} />
        </div>
      )}
    </section>
  );
}
