'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calculator,
  ClipboardList,
  Layers3,
  Pencil,
  PieChart,
  Plus,
  Save,
  Settings2,
  Trash2,
} from '@tuturuuu/icons';
import type {
  InventoryCostProfile,
  InventoryProductFormOptionsResponse,
  InventoryProductSummary,
} from '@tuturuuu/internal-api/inventory';
import {
  createInventoryCostProfile,
  createInventoryProductCategory,
  deleteInventoryCostProfile,
  updateInventoryCostProfile,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogClose, DialogTrigger } from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
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
import { LifecyclePanel } from './operator-lifecycle';
import { numberOrZero } from './operator-stock';
import { useWorkspaceCurrency } from './workspace-currency';

type ScenarioInput = {
  id?: string;
  artCommissionCost: string;
  batchSize: string;
  manufacturingCostPerUnit: string;
  name: string;
  otherCostPerUnit: string;
  packagingCostPerUnit: string;
  shippingCost: string;
  tariffCost: string;
};

type ProfitShareInput = {
  id?: string;
  recipientLabel: string;
  sharePercentage: string;
};

type FormState = {
  categoryId: string;
  currency: string;
  name: string;
  notes: string;
  productId: string;
  profitShares: ProfitShareInput[];
  scenarios: ScenarioInput[];
  status: InventoryCostProfile['status'];
  targetRetailPrice: string;
};

function numeric(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptyScenario(): ScenarioInput {
  return {
    artCommissionCost: '',
    batchSize: '30',
    manufacturingCostPerUnit: '',
    name: '',
    otherCostPerUnit: '',
    packagingCostPerUnit: '',
    shippingCost: '',
    tariffCost: '',
  };
}

function defaultProfitShares(): ProfitShareInput[] {
  return [
    { recipientLabel: 'Talent', sharePercentage: '70' },
    { recipientLabel: 'Partner', sharePercentage: '30' },
  ];
}

function initialState(
  profile: InventoryCostProfile | undefined,
  fallbackCurrency: string
): FormState {
  if (!profile) {
    return {
      categoryId: '',
      currency: fallbackCurrency,
      name: '',
      notes: '',
      productId: '',
      profitShares: defaultProfitShares(),
      scenarios: [emptyScenario()],
      status: 'active',
      targetRetailPrice: '',
    };
  }

  return {
    categoryId: profile.categoryId ?? '',
    currency: profile.currency,
    name: profile.name,
    notes: profile.notes ?? '',
    productId: profile.productId ?? '',
    profitShares: profile.profitShares.length
      ? profile.profitShares.map((share) => ({
          id: share.id,
          recipientLabel: share.recipientLabel,
          sharePercentage: String(share.sharePercentage),
        }))
      : defaultProfitShares(),
    scenarios: profile.scenarios.length
      ? profile.scenarios.map((scenario) => ({
          artCommissionCost: String(scenario.artCommissionCost ?? ''),
          batchSize: String(scenario.batchSize ?? ''),
          id: scenario.id,
          manufacturingCostPerUnit: String(
            scenario.manufacturingCostPerUnit ?? ''
          ),
          name: scenario.name,
          otherCostPerUnit: String(scenario.otherCostPerUnit ?? ''),
          packagingCostPerUnit: String(scenario.packagingCostPerUnit ?? ''),
          shippingCost: String(scenario.shippingCost ?? ''),
          tariffCost: String(scenario.tariffCost ?? ''),
        }))
      : [emptyScenario()],
    status: profile.status,
    targetRetailPrice: String(profile.targetRetailPrice ?? ''),
  };
}

/**
 * Single dialog used for both creating and editing a costing profile. Pass a
 * `profile` to open in edit mode (adds the lifecycle controls); omit it to
 * create. Scenarios and profit shares are fully editable — the backend replaces
 * both arrays wholesale, so add/remove/edit here maps straight to persistence.
 */
export function CostingProfileDialog({
  options,
  products = [],
  profile,
  trigger,
  wsId,
}: {
  options?: InventoryProductFormOptionsResponse;
  products?: InventoryProductSummary[];
  profile?: InventoryCostProfile;
  trigger?: ReactNode;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.costing');
  const forms = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const wsCurrency = useWorkspaceCurrency();
  const isEdit = Boolean(profile);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() =>
    initialState(profile, wsCurrency)
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
  };

  // Selecting a catalog product pre-fills the profile name, category, and
  // retail price from that product (only when those fields are still empty), so
  // a costing profile stays connected back to the catalog product it prices.
  const handleProductChange = (productId: string) => {
    const product = products.find((item) => item.id === productId);
    setForm((current) => {
      if (!product) return { ...current, productId };
      const price = numberOrZero(product.inventory?.[0]?.price);
      return {
        ...current,
        categoryId: current.categoryId || product.category_id || '',
        name: current.name || product.name,
        productId,
        targetRetailPrice:
          current.targetRetailPrice ||
          (price > 0 ? String(price) : current.targetRetailPrice),
      };
    });
  };

  const createCategory = async (name: string) => {
    try {
      const result = await createInventoryProductCategory(wsId, { name });
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'form-options'],
      });
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : forms('saveError'));
      throw error;
    }
  };

  const buildPayload = () => ({
    categoryId: form.categoryId || null,
    currency: form.currency.trim().toUpperCase() || 'USD',
    name: form.name.trim(),
    notes: form.notes || null,
    productId: form.productId || null,
    profitShares: form.profitShares.map((share, index) => ({
      ...(share.id ? { id: share.id } : {}),
      recipientLabel: share.recipientLabel.trim() || `Recipient ${index + 1}`,
      sharePercentage: numeric(share.sharePercentage),
      sortOrder: index,
    })),
    scenarios: form.scenarios.map((scenario, index) => ({
      ...(scenario.id ? { id: scenario.id } : {}),
      artCommissionCost: numeric(scenario.artCommissionCost),
      batchSize: Math.max(1, numeric(scenario.batchSize)),
      manufacturingCostPerUnit: numeric(scenario.manufacturingCostPerUnit),
      name: scenario.name.trim() || `${scenario.batchSize || index + 1} units`,
      otherCostPerUnit: numeric(scenario.otherCostPerUnit),
      packagingCostPerUnit: numeric(scenario.packagingCostPerUnit),
      shippingCost: numeric(scenario.shippingCost),
      sortOrder: index,
      tariffCost: numeric(scenario.tariffCost),
    })),
    status: form.status,
    targetRetailPrice: numeric(form.targetRetailPrice),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      profile
        ? updateInventoryCostProfile(wsId, profile.id, buildPayload())
        : createInventoryCostProfile(wsId, buildPayload()),
    onError: () => toast.error(forms('saveError')),
    onSuccess: () => {
      toast.success(forms('saveSuccess'));
      invalidate();
      if (!isEdit) {
        setForm(initialState(undefined, wsCurrency));
      }
      setOpen(false);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: () =>
      profile
        ? updateInventoryCostProfile(wsId, profile.id, { status: 'archived' })
        : Promise.resolve(null),
    onError: () => toast.error(forms('saveError')),
    onSuccess: () => {
      toast.success(forms('saveSuccess'));
      setOpen(false);
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      profile
        ? deleteInventoryCostProfile(wsId, profile.id)
        : Promise.resolve(null),
    onError: () => toast.error(forms('deleteError')),
    onSuccess: () => {
      toast.success(forms('deleteSuccess'));
      setOpen(false);
      invalidate();
    },
  });

  const sharesTotal = form.profitShares.reduce(
    (sum, share) => sum + numeric(share.sharePercentage),
    0
  );
  const sharesOff =
    form.profitShares.length > 0 && Math.abs(sharesTotal - 100) > 0.01;
  const canSave = Boolean(form.name.trim() && form.targetRetailPrice);

  const updateScenario = (index: number, patch: Partial<ScenarioInput>) =>
    setForm((current) => ({
      ...current,
      scenarios: current.scenarios.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      ),
    }));

  const updateShare = (index: number, patch: Partial<ProfitShareInput>) =>
    setForm((current) => ({
      ...current,
      profitShares: current.profitShares.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      ),
    }));

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (nextOpen) setForm(initialState(profile, wsCurrency));
        setOpen(nextOpen);
      }}
      open={open}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" type="button" variant="outline">
            <Pencil className="h-4 w-4" />
            {forms('edit')}
          </Button>
        )}
      </DialogTrigger>
      <OperatorDialogContent size="lg">
        <OperatorDialogHeader
          description={
            isEdit ? t('editProfileDescription') : t('summaryDescription')
          }
          title={isEdit ? t('editProfileTitle') : t('newProfile')}
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
              description={t('steps.profileDescription')}
              icon={<Settings2 className="h-4 w-4" />}
              title={forms('tabs.details')}
            >
              <div className="grid min-w-0 gap-3 lg:grid-cols-2 xl:grid-cols-4">
                <SelectField
                  className="xl:col-span-2"
                  emptyText={forms('emptyOptions')}
                  label={forms('product')}
                  onChange={handleProductChange}
                  options={products}
                  placeholder={forms('placeholders.product')}
                  searchPlaceholder={forms('searchOptions', {
                    resource: forms('product'),
                  })}
                  value={form.productId}
                />
                <SelectField
                  createText={forms('createOption', {
                    resource: forms('category'),
                  })}
                  creatingText={forms('creatingOption', {
                    resource: forms('category'),
                  })}
                  emptyText={forms('emptyOptions')}
                  label={forms('category')}
                  onChange={(categoryId) =>
                    setForm((current) => ({ ...current, categoryId }))
                  }
                  onCreate={createCategory}
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
                  onChange={(status) =>
                    setForm((current) => ({
                      ...current,
                      status: status as InventoryCostProfile['status'],
                    }))
                  }
                  options={[
                    { label: t('status.draft'), value: 'draft' },
                    { label: t('status.active'), value: 'active' },
                    { label: t('status.archived'), value: 'archived' },
                  ]}
                  placeholder={forms('placeholders.status')}
                  value={form.status}
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
                  hint={forms('hints.retail')}
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
              description={t('steps.scenariosDescription')}
              icon={<Layers3 className="h-4 w-4" />}
              title={forms('tabs.scenarios')}
            >
              <div className="grid min-w-0 gap-3">
                {form.scenarios.map((scenario, index) => (
                  <div
                    className="grid min-w-0 gap-2 rounded-md border border-border p-3"
                    key={scenario.id ?? `scenario-${index}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm">
                        {t('scenario')} {index + 1}
                      </span>
                      <Button
                        aria-label={forms('delete')}
                        disabled={form.scenarios.length === 1}
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            scenarios: current.scenarios.filter(
                              (_, itemIndex) => itemIndex !== index
                            ),
                          }))
                        }
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid min-w-0 gap-2 md:grid-cols-2 xl:grid-cols-4">
                      <TextField
                        label={t('scenarioName')}
                        onChange={(name) => updateScenario(index, { name })}
                        placeholder={forms('placeholders.batchSize')}
                        value={scenario.name}
                      />
                      <NumberField
                        hint={forms('hints.batchSize')}
                        label={t('batchSize')}
                        onChange={(batchSize) =>
                          updateScenario(index, { batchSize })
                        }
                        placeholder={forms('placeholders.batchSize')}
                        value={scenario.batchSize}
                      />
                      <NumberField
                        hint={forms('hints.unitCost')}
                        label={t('unitCost')}
                        onChange={(manufacturingCostPerUnit) =>
                          updateScenario(index, { manufacturingCostPerUnit })
                        }
                        placeholder={forms('placeholders.unitCost')}
                        value={scenario.manufacturingCostPerUnit}
                      />
                      <NumberField
                        hint={t('hints.artCommission')}
                        label={t('artCommission')}
                        onChange={(artCommissionCost) =>
                          updateScenario(index, { artCommissionCost })
                        }
                        placeholder={forms('placeholders.unitCost')}
                        value={scenario.artCommissionCost}
                      />
                      <NumberField
                        hint={t('hints.shipping')}
                        label={t('shipping')}
                        onChange={(shippingCost) =>
                          updateScenario(index, { shippingCost })
                        }
                        placeholder={forms('placeholders.unitCost')}
                        value={scenario.shippingCost}
                      />
                      <NumberField
                        hint={t('hints.tariff')}
                        label={t('tariff')}
                        onChange={(tariffCost) =>
                          updateScenario(index, { tariffCost })
                        }
                        placeholder={forms('placeholders.unitCost')}
                        value={scenario.tariffCost}
                      />
                      <NumberField
                        hint={t('hints.packaging')}
                        label={t('packaging')}
                        onChange={(packagingCostPerUnit) =>
                          updateScenario(index, { packagingCostPerUnit })
                        }
                        placeholder={forms('placeholders.unitCost')}
                        value={scenario.packagingCostPerUnit}
                      />
                      <NumberField
                        hint={t('hints.other')}
                        label={t('other')}
                        onChange={(otherCostPerUnit) =>
                          updateScenario(index, { otherCostPerUnit })
                        }
                        placeholder={forms('placeholders.unitCost')}
                        value={scenario.otherCostPerUnit}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <Button
                className="w-fit"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    scenarios: [...current.scenarios, emptyScenario()],
                  }))
                }
                type="button"
                variant="outline"
              >
                <Plus className="h-4 w-4" />
                {t('addScenario')}
              </Button>
            </FormSection>

            <FormSection
              description={t('steps.profitSharesDescription')}
              icon={<PieChart className="h-4 w-4" />}
              title={forms('tabs.profitShares')}
            >
              <div className="grid min-w-0 gap-2">
                {form.profitShares.map((share, index) => (
                  <div
                    className="grid min-w-0 items-end gap-2 rounded-md border border-border p-2 sm:grid-cols-[minmax(0,1fr)_140px_auto]"
                    key={share.id ?? `share-${index}`}
                  >
                    <TextField
                      label={t('recipient')}
                      onChange={(recipientLabel) =>
                        updateShare(index, { recipientLabel })
                      }
                      placeholder={t('recipient')}
                      value={share.recipientLabel}
                    />
                    <NumberField
                      label={t('sharePercentage')}
                      onChange={(sharePercentage) =>
                        updateShare(index, { sharePercentage })
                      }
                      placeholder="0"
                      value={share.sharePercentage}
                    />
                    <Button
                      aria-label={forms('delete')}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          profitShares: current.profitShares.filter(
                            (_, itemIndex) => itemIndex !== index
                          ),
                        }))
                      }
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  className="w-fit"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      profitShares: [
                        ...current.profitShares,
                        { recipientLabel: '', sharePercentage: '' },
                      ],
                    }))
                  }
                  type="button"
                  variant="outline"
                >
                  <Plus className="h-4 w-4" />
                  {t('addProfitShare')}
                </Button>
                <span
                  className={
                    sharesOff
                      ? 'text-dynamic-orange text-xs'
                      : 'text-muted-foreground text-xs'
                  }
                >
                  {sharesOff
                    ? t('sharesWarning', { total: sharesTotal })
                    : t('sharesTotal', { total: sharesTotal })}
                </span>
              </div>
            </FormSection>

            {isEdit ? (
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
            ) : null}
          </OperatorDialogBody>
          <OperatorDialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {forms('cancel')}
              </Button>
            </DialogClose>
            <Button disabled={!canSave || saveMutation.isPending} type="submit">
              {isEdit ? (
                <Save className="h-4 w-4" />
              ) : (
                <Calculator className="h-4 w-4" />
              )}
              {saveMutation.isPending
                ? forms('saving')
                : isEdit
                  ? forms('save')
                  : t('saveProfile')}
            </Button>
          </OperatorDialogFooter>
        </form>
      </OperatorDialogContent>
    </Dialog>
  );
}
