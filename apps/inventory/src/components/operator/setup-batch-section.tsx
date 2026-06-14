'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Layers3, Plus, Settings2 } from '@tuturuuu/icons';
import type { InventoryProductFormOptionsResponse } from '@tuturuuu/internal-api/inventory';
import {
  createInventoryBatch,
  createInventorySupplier,
  createInventoryWarehouse,
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
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { operatorDialogContentClassName } from './operator-dialog';
import { SelectField } from './operator-form-fields';
import { LifecyclePanel } from './operator-lifecycle';
import { invalidateSetup, namedRows } from './setup-helpers';

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
  const createReference = async (create: () => Promise<unknown>) => {
    try {
      const result = await create();
      invalidateSetup(queryClient, wsId);
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('saveError'));
      throw error;
    }
  };
  const createText = (resource: string) => t('createOption', { resource });
  const creatingText = (resource: string) => t('creatingOption', { resource });
  const searchText = (resource: string) => t('searchOptions', { resource });
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
      <DialogContent className={operatorDialogContentClassName('medium')}>
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
          <SelectField
            createText={createText(t('warehouse'))}
            creatingText={creatingText(t('warehouse'))}
            emptyText={t('emptyOptions')}
            label={t('warehouse')}
            onChange={setWarehouseId}
            onCreate={(name) =>
              createReference(() => createInventoryWarehouse(wsId, { name }))
            }
            options={options?.warehouses}
            placeholder={t('placeholders.warehouse')}
            searchPlaceholder={searchText(t('warehouse'))}
            value={warehouseId}
          />
          <SelectField
            createText={createText(t('supplier'))}
            creatingText={creatingText(t('supplier'))}
            emptyText={t('emptyOptions')}
            label={t('supplier')}
            onChange={setSupplierId}
            onCreate={(name) =>
              createReference(() => createInventorySupplier(wsId, { name }))
            }
            options={namedRows(suppliers)}
            placeholder={t('placeholders.supplier')}
            searchPlaceholder={searchText(t('supplier'))}
            value={supplierId}
          />
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
      <Dialog>
        <DialogTrigger asChild>
          <Button size="sm" type="button" variant="outline">
            <Settings2 className="h-4 w-4" />
            {t('manage')}
          </Button>
        </DialogTrigger>
        <DialogContent className={operatorDialogContentClassName('compact')}>
          <DialogHeader>
            <DialogTitle>{t('manageBatchTitle')}</DialogTitle>
            <DialogDescription>{t('manageBatchDescription')}</DialogDescription>
          </DialogHeader>
          <Tabs className="grid min-w-0 gap-4" defaultValue="details">
            <TabsList className="h-auto w-full flex-wrap justify-start bg-muted/25">
              <TabsTrigger value="details">{t('tabs.details')}</TabsTrigger>
              <TabsTrigger value="lifecycle">{t('tabs.lifecycle')}</TabsTrigger>
            </TabsList>
            <TabsContent value="details">
              <dl className="grid gap-2 rounded-lg border border-border bg-muted/15 p-3 text-sm">
                <div className="grid gap-1 sm:grid-cols-[120px_1fr]">
                  <dt className="text-muted-foreground">{t('warehouse')}</dt>
                  <dd className="font-medium">
                    {batch.warehouse ?? batch.warehouse_id}
                  </dd>
                </div>
                <div className="grid gap-1 sm:grid-cols-[120px_1fr]">
                  <dt className="text-muted-foreground">{t('supplier')}</dt>
                  <dd className="font-medium">{batch.supplier ?? '-'}</dd>
                </div>
                <div className="grid gap-1 sm:grid-cols-[120px_1fr]">
                  <dt className="text-muted-foreground">{t('price')}</dt>
                  <dd className="font-medium">{batch.price ?? 0}</dd>
                </div>
              </dl>
            </TabsContent>
            <TabsContent value="lifecycle">
              <LifecyclePanel
                deletePending={deleteMutation.isPending}
                onDelete={() => deleteMutation.mutate()}
                title={t('lifecycle')}
              />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
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
      {batches.length
        ? batches
            .filter((batch): batch is ProductBatch & { id: string } =>
              Boolean(batch.id)
            )
            .map((batch) => (
              <BatchRow batch={batch} key={batch.id} wsId={wsId} />
            ))
        : null}
    </section>
  );
}
