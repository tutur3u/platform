'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList,
  Layers3,
  Pencil,
  PieChart,
  Save,
  Settings2,
} from '@tuturuuu/icons';
import type {
  InventoryCostProfile,
  InventoryProductFormOptionsResponse,
  InventoryProductSummary,
} from '@tuturuuu/internal-api/inventory';
import {
  deleteInventoryCostProfile,
  updateInventoryCostProfile,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogClose, DialogTrigger } from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  FormSection,
  OperatorDialogBody,
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
} from './operator-dialog-shell';
import {
  NumberField,
  SelectField,
  SelectValueField,
  TextAreaField,
  TextField,
} from './operator-form-fields';
import { currency } from './operator-format';
import { LifecyclePanel } from './operator-lifecycle';

export function CostingProfileList({
  options,
  products,
  profiles,
  wsId,
}: {
  options?: InventoryProductFormOptionsResponse;
  products?: InventoryProductSummary[];
  profiles: InventoryCostProfile[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.costing');
  const forms = useTranslations('inventory.operator.forms');

  if (profiles.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="px-3 py-2">{t('item')}</th>
            <th className="px-3 py-2">{t('retail')}</th>
            <th className="px-3 py-2">{t('scenarios')}</th>
            <th className="px-3 py-2">{t('margin')}</th>
            <th className="px-3 py-2">{t('breakEven')}</th>
            <th className="px-3 py-2">{forms('actions')}</th>
          </tr>
        </thead>
        <tbody>
          {profiles.map((profile) => {
            const firstScenario = profile.scenarios[0];

            return (
              <tr className="border-border border-t" key={profile.id}>
                <td className="px-3 py-3">
                  <p className="font-medium">{profile.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {profile.categoryName ?? t('uncategorized')}
                  </p>
                </td>
                <td className="px-3 py-3">
                  {currency(profile.targetRetailPrice, profile.currency, 2)}
                </td>
                <td className="px-3 py-3">{profile.scenarios.length}</td>
                <td className="px-3 py-3">
                  {firstScenario
                    ? `${firstScenario.metrics.grossMarginPercentage}%`
                    : '-'}
                </td>
                <td className="px-3 py-3">
                  {firstScenario?.metrics.breakEvenQuantity ?? '-'}
                </td>
                <td className="px-3 py-3">
                  <CostingProfileEditorDialog
                    options={options}
                    products={products}
                    profile={profile}
                    wsId={wsId}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CostingProfileEditorDialog({
  options,
  products = [],
  profile,
  wsId,
}: {
  options?: InventoryProductFormOptionsResponse;
  products?: InventoryProductSummary[];
  profile: InventoryCostProfile;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.costing');
  const forms = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => getInitialForm(profile));
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
    queryClient.invalidateQueries({ queryKey: ['inventory', wsId, 'costing'] });
    queryClient.invalidateQueries({
      queryKey: ['inventory', wsId, 'costing-analytics'],
    });
  };
  const saveMutation = useMutation({
    mutationFn: () =>
      updateInventoryCostProfile(wsId, profile.id, {
        categoryId: form.categoryId || null,
        currency: form.currency.trim().toUpperCase() || 'USD',
        name: form.name.trim(),
        notes: form.notes || null,
        productId: form.productId || null,
        profitShares: profile.profitShares.map((share) => ({
          id: share.id,
          recipientLabel: share.recipientLabel,
          sharePercentage: share.sharePercentage,
          sortOrder: share.sortOrder,
        })),
        scenarios: profile.scenarios.map((scenario) => ({
          artCommissionCost: scenario.artCommissionCost,
          batchSize: scenario.batchSize,
          id: scenario.id,
          manufacturingCostPerUnit: scenario.manufacturingCostPerUnit,
          name: scenario.name,
          otherCostPerUnit: scenario.otherCostPerUnit,
          packagingCostPerUnit: scenario.packagingCostPerUnit,
          shippingCost: scenario.shippingCost,
          sortOrder: scenario.sortOrder,
          tariffCost: scenario.tariffCost,
        })),
        status: form.status as InventoryCostProfile['status'],
        targetRetailPrice: Number(form.targetRetailPrice || 0),
      }),
    onError: () => toast.error(forms('saveError')),
    onSuccess: () => {
      toast.success(forms('saveSuccess'));
      invalidate();
    },
  });
  const archiveMutation = useMutation({
    mutationFn: () =>
      updateInventoryCostProfile(wsId, profile.id, { status: 'archived' }),
    onError: () => toast.error(forms('saveError')),
    onSuccess: () => {
      toast.success(forms('saveSuccess'));
      setOpen(false);
      invalidate();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: () => deleteInventoryCostProfile(wsId, profile.id),
    onError: () => toast.error(forms('deleteError')),
    onSuccess: () => {
      toast.success(forms('deleteSuccess'));
      setOpen(false);
      invalidate();
    },
  });
  const canSave = Boolean(form.name.trim() && form.targetRetailPrice);

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (nextOpen) setForm(getInitialForm(profile));
        setOpen(nextOpen);
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <Pencil className="h-4 w-4" />
          {forms('edit')}
        </Button>
      </DialogTrigger>
      <OperatorDialogContent size="lg">
        <OperatorDialogHeader
          description={t('editProfileDescription')}
          title={t('editProfileTitle')}
        />
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave) saveMutation.mutate();
          }}
        >
          <OperatorDialogBody className="grid gap-6">
            <FormSection
              description={t('editProfileDescription')}
              icon={<Settings2 className="h-4 w-4" />}
              title={forms('tabs.details')}
            >
              <div className="grid min-w-0 gap-3 lg:grid-cols-2 xl:grid-cols-4">
                <SelectField
                  className="xl:col-span-2"
                  emptyText={forms('emptyOptions')}
                  label={forms('product')}
                  onChange={(productId) =>
                    setForm((current) => ({ ...current, productId }))
                  }
                  options={products}
                  placeholder={forms('placeholders.product')}
                  searchPlaceholder={forms('searchOptions', {
                    resource: forms('product'),
                  })}
                  value={form.productId}
                />
                <SelectField
                  emptyText={forms('emptyOptions')}
                  label={forms('category')}
                  onChange={(categoryId) =>
                    setForm((current) => ({ ...current, categoryId }))
                  }
                  options={options?.categories}
                  placeholder={forms('placeholders.category')}
                  searchPlaceholder={forms('searchOptions', {
                    resource: forms('category'),
                  })}
                  value={form.categoryId}
                />
                <SelectValueField
                  allowEmpty={false}
                  label={forms('status')}
                  options={[
                    { label: t('status.draft'), value: 'draft' },
                    { label: t('status.active'), value: 'active' },
                    { label: t('status.archived'), value: 'archived' },
                  ]}
                  placeholder={forms('placeholders.status')}
                  value={form.status}
                  onChange={(status) =>
                    setForm((current) => ({
                      ...current,
                      status: status as InventoryCostProfile['status'],
                    }))
                  }
                />
                <TextField
                  className="xl:col-span-2"
                  label={t('itemName')}
                  onChange={(name) =>
                    setForm((current) => ({ ...current, name }))
                  }
                  placeholder={forms('placeholders.costingProfileName')}
                  value={form.name}
                />
                <TextField
                  label={forms('currency')}
                  onChange={(currencyValue) =>
                    setForm((current) => ({
                      ...current,
                      currency: currencyValue,
                    }))
                  }
                  placeholder={forms('placeholders.currency')}
                  value={form.currency}
                />
                <NumberField
                  label={t('retail')}
                  onChange={(targetRetailPrice) =>
                    setForm((current) => ({ ...current, targetRetailPrice }))
                  }
                  placeholder={forms('placeholders.retail')}
                  value={form.targetRetailPrice}
                />
                <TextAreaField
                  className="lg:col-span-2 xl:col-span-4"
                  label={forms('note')}
                  onChange={(notes) =>
                    setForm((current) => ({ ...current, notes }))
                  }
                  placeholder={forms('placeholders.saleNote')}
                  value={form.notes}
                />
              </div>
            </FormSection>
            <FormSection
              icon={<Layers3 className="h-4 w-4" />}
              title={forms('tabs.scenarios')}
            >
              <div className="grid min-w-0 gap-2">
                {profile.scenarios.map((scenario) => (
                  <div
                    className="grid min-w-0 gap-2 rounded-md border border-border bg-muted/15 p-3 text-sm md:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
                    key={scenario.id}
                  >
                    <span className="truncate font-medium">
                      {scenario.name}
                    </span>
                    <span>
                      {t('batchSize')}: {scenario.batchSize}
                    </span>
                    <span>
                      {t('unitCost')}:{' '}
                      {currency(scenario.manufacturingCostPerUnit)}
                    </span>
                    <span>
                      {t('breakEven')}:{' '}
                      {scenario.metrics.breakEvenQuantity ?? '-'}
                    </span>
                  </div>
                ))}
              </div>
            </FormSection>
            <FormSection
              icon={<PieChart className="h-4 w-4" />}
              title={forms('tabs.profitShares')}
            >
              <div className="grid min-w-0 gap-2">
                {profile.profitShares.map((share) => (
                  <div
                    className="grid min-w-0 gap-2 rounded-md border border-border bg-muted/15 p-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"
                    key={share.id}
                  >
                    <span className="truncate font-medium">
                      {share.recipientLabel}
                    </span>
                    <span>{share.sharePercentage}%</span>
                  </div>
                ))}
              </div>
            </FormSection>
            <FormSection
              icon={<ClipboardList className="h-4 w-4" />}
              title={forms('tabs.lifecycle')}
            >
              <LifecyclePanel
                archivePending={archiveMutation.isPending}
                deletePending={deleteMutation.isPending}
                onArchive={() => archiveMutation.mutate()}
                onDelete={() => deleteMutation.mutate()}
                title={forms('lifecycle')}
              />
            </FormSection>
          </OperatorDialogBody>
          <OperatorDialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {forms('cancel')}
              </Button>
            </DialogClose>
            <Button disabled={!canSave || saveMutation.isPending} type="submit">
              <Save className="h-4 w-4" />
              {saveMutation.isPending ? forms('saving') : forms('save')}
            </Button>
          </OperatorDialogFooter>
        </form>
      </OperatorDialogContent>
    </Dialog>
  );
}

function getInitialForm(profile: InventoryCostProfile) {
  return {
    categoryId: profile.categoryId ?? '',
    currency: profile.currency,
    name: profile.name,
    notes: profile.notes ?? '',
    productId: profile.productId ?? '',
    status: profile.status,
    targetRetailPrice: String(profile.targetRetailPrice ?? ''),
  };
}
