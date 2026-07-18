'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  CalendarDays,
  Pencil,
  Plus,
  RotateCcw,
} from '@tuturuuu/icons';
import type {
  InventoryProductSummary,
  InventorySaleSummary,
  InventorySalesPeriod,
  InventorySalesPeriodProductScope,
} from '@tuturuuu/internal-api/inventory';
import {
  createInventorySalesPeriod,
  deleteInventorySalesPeriod,
  setInventorySalePeriod,
  updateInventorySalesPeriod,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogClose, DialogTrigger } from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import {
  OperatorDialogBody,
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
} from './operator-dialog-shell';
import { SelectValueField } from './operator-form-fields';
import { LifecyclePanel } from './operator-lifecycle';
import { UNASSIGNED_SALES_PERIOD_FILTER } from './operator-types';
import { SalesPeriodProductRules } from './sales-period-product-rules';

const ALL_PERIODS = '__all__';
export const NO_PERIOD = '__none__';

export function SalesPeriodsPanel({
  fetchNextProductsPage,
  hasNextProductsPage,
  isFetchingNextProductsPage,
  onSelect,
  periods,
  products,
  selectedPeriodId,
  wsId,
}: {
  fetchNextProductsPage: () => unknown;
  hasNextProductsPage: boolean;
  isFetchingNextProductsPage: boolean;
  onSelect: (periodId: string) => void;
  periods: InventorySalesPeriod[];
  products: InventoryProductSummary[];
  selectedPeriodId: string;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.commerce.periods');
  const queryClient = useQueryClient();
  const selected = periods.find((period) => period.id === selectedPeriodId);
  const lifecycleMutation = useMutation({
    mutationFn: (period: InventorySalesPeriod) =>
      updateInventorySalesPeriod(wsId, period.id, {
        status: period.status === 'active' ? 'archived' : 'active',
      }),
    onError: () => toast.error(t('saveError')),
    onSuccess: ({ data }) => {
      toast.success(
        data.status === 'archived' ? t('archivedSuccess') : t('restoredSuccess')
      );
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'sales-periods'],
      });
    },
  });

  return (
    <section className="grid gap-3 rounded-xl border border-primary/20 bg-primary/[0.035] p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
          <CalendarDays className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="font-medium text-sm">{t('title')}</p>
          <p className="mt-0.5 text-muted-foreground text-xs">
            {t('description')}
          </p>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
        <SelectValueField
          allowEmpty={false}
          className="min-w-44 flex-1 sm:w-56 sm:flex-none"
          label={t('title')}
          onChange={(value) => onSelect(value === ALL_PERIODS ? '' : value)}
          options={[
            { label: t('all'), value: ALL_PERIODS },
            {
              label: t('unassigned'),
              value: UNASSIGNED_SALES_PERIOD_FILTER,
            },
            ...periods.map((period) => ({
              label: `${period.name} · ${period.sale_count}`,
              value: period.id,
            })),
          ]}
          placeholder={t('all')}
          searchPlaceholder={t('title')}
          value={selectedPeriodId || ALL_PERIODS}
        />
        {selected ? (
          <SalesPeriodDialog
            fetchNextProductsPage={fetchNextProductsPage}
            hasNextProductsPage={hasNextProductsPage}
            isFetchingNextProductsPage={isFetchingNextProductsPage}
            key={selected.id}
            period={selected}
            products={products}
            wsId={wsId}
          />
        ) : null}
        {selected ? (
          <Button
            disabled={lifecycleMutation.isPending}
            onClick={() => lifecycleMutation.mutate(selected)}
            size="sm"
            type="button"
            variant="outline"
          >
            {selected.status === 'active' ? (
              <Archive className="h-4 w-4" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            {selected.status === 'active' ? t('archive') : t('restore')}
          </Button>
        ) : null}
        <SalesPeriodDialog
          fetchNextProductsPage={fetchNextProductsPage}
          hasNextProductsPage={hasNextProductsPage}
          isFetchingNextProductsPage={isFetchingNextProductsPage}
          key="create"
          products={products}
          wsId={wsId}
        />
      </div>
    </section>
  );
}

function SalesPeriodDialog({
  fetchNextProductsPage,
  hasNextProductsPage,
  isFetchingNextProductsPage,
  period,
  products,
  wsId,
}: {
  fetchNextProductsPage: () => unknown;
  hasNextProductsPage: boolean;
  isFetchingNextProductsPage: boolean;
  period?: InventorySalesPeriod;
  products: InventoryProductSummary[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.commerce.periods');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(period?.name ?? '');
  const [description, setDescription] = useState(period?.description ?? '');
  const [startsAt, setStartsAt] = useState(period?.starts_at ?? '');
  const [endsAt, setEndsAt] = useState(period?.ends_at ?? '');
  const [productScope, setProductScope] =
    useState<InventorySalesPeriodProductScope>(period?.product_scope ?? 'all');
  const [productIds, setProductIds] = useState<string[]>(
    period?.product_ids ?? []
  );
  const isEditing = Boolean(period);
  const mutation = useMutation({
    mutationFn: () =>
      period
        ? updateInventorySalesPeriod(wsId, period.id, {
            description: description.trim() || null,
            ends_at: endsAt || null,
            name: name.trim(),
            product_ids: productScope === 'all' ? [] : productIds,
            product_scope: productScope,
            starts_at: startsAt || null,
          })
        : createInventorySalesPeriod(wsId, {
            description: description.trim() || null,
            ends_at: endsAt || null,
            name: name.trim(),
            product_ids: productScope === 'all' ? [] : productIds,
            product_scope: productScope,
            starts_at: startsAt || null,
          }),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      toast.success(t(isEditing ? 'updatedSuccess' : 'createdSuccess'));
      setOpen(false);
      if (!isEditing) {
        setName('');
        setDescription('');
        setStartsAt('');
        setEndsAt('');
        setProductScope('all');
        setProductIds([]);
      }
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'sales-periods'],
      });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () =>
      period
        ? deleteInventorySalesPeriod(wsId, period.id)
        : Promise.resolve({ ok: false }),
    onError: () => toast.error(t('deleteError')),
    onSuccess: () => {
      toast.success(t('deletedSuccess'));
      setOpen(false);
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'sales-periods'],
      });
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'commerce-summary'],
      });
    },
  });

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          type="button"
          variant={isEditing ? 'outline' : 'default'}
        >
          {isEditing ? (
            <Pencil className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {t(isEditing ? 'edit' : 'create')}
        </Button>
      </DialogTrigger>
      <OperatorDialogContent size="sm">
        <OperatorDialogHeader
          description={t(isEditing ? 'editDescription' : 'createDescription')}
          title={t(isEditing ? 'editTitle' : 'createTitle')}
        />
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <OperatorDialogBody className="grid gap-4">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">{t('name')}</span>
              <Input
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('namePlaceholder')}
                value={name}
              />
            </label>
            <SalesPeriodProductRules
              fetchNextPage={fetchNextProductsPage}
              hasNextPage={hasNextProductsPage}
              isFetchingNextPage={isFetchingNextProductsPage}
              onProductIdsChange={setProductIds}
              onScopeChange={setProductScope}
              productIds={productIds}
              products={products}
              scope={productScope}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">{t('startsAt')}</span>
                <Input
                  onChange={(event) => setStartsAt(event.target.value)}
                  type="date"
                  value={startsAt}
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">{t('endsAt')}</span>
                <Input
                  min={startsAt || undefined}
                  onChange={(event) => setEndsAt(event.target.value)}
                  type="date"
                  value={endsAt}
                />
              </label>
            </div>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">{t('notes')}</span>
              <Textarea
                maxLength={500}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t('notesPlaceholder')}
                rows={3}
                value={description}
              />
            </label>
            {period ? (
              <LifecyclePanel
                deleteDisabled={period.sale_count > 0}
                deletePending={deleteMutation.isPending}
                description={
                  period.sale_count > 0
                    ? t('deleteInUseDescription')
                    : t('deleteDescription')
                }
                onDelete={() => deleteMutation.mutate()}
                title={t('lifecycle')}
              />
            ) : null}
          </OperatorDialogBody>
          <OperatorDialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t('cancel')}
              </Button>
            </DialogClose>
            <Button
              disabled={
                !name.trim() ||
                Boolean(startsAt && endsAt && startsAt > endsAt) ||
                (productScope !== 'all' && productIds.length === 0) ||
                mutation.isPending
              }
              type="submit"
            >
              {mutation.isPending
                ? t('saving')
                : t(isEditing ? 'save' : 'create')}
            </Button>
          </OperatorDialogFooter>
        </form>
      </OperatorDialogContent>
    </Dialog>
  );
}

export function SalePeriodPicker({
  periods,
  sale,
  wsId,
}: {
  periods: InventorySalesPeriod[];
  sale: InventorySaleSummary;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.commerce.periods');
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (periodId: string) =>
      setInventorySalePeriod(wsId, sale.id, {
        period_id: periodId === NO_PERIOD ? null : periodId,
        source: sale.source,
      }),
    onError: () => toast.error(t('assignError')),
    onSuccess: () => {
      toast.success(t('assignedSuccess'));
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId, 'sales'] });
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'commerce-summary'],
      });
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'sales-periods'],
      });
    },
  });

  return (
    <SelectValueField
      allowEmpty={false}
      className="min-w-36 max-w-52"
      disabled={mutation.isPending}
      label={t('assignmentLabel')}
      onChange={(value) => mutation.mutate(value)}
      options={[
        { label: t('unassigned'), value: NO_PERIOD },
        ...periods.map((period) => ({
          label: period.name,
          value: period.id,
        })),
      ]}
      placeholder={t('unassigned')}
      searchPlaceholder={t('assignmentLabel')}
      value={sale.period?.id ?? NO_PERIOD}
    />
  );
}
