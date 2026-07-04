'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calculator,
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
  CostingProfitSharesEditor,
  CostingScenariosEditor,
} from './costing-profile-editors';
import {
  buildProfilePayload,
  type FormState,
  initialState,
} from './costing-profile-form-state';
import {
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
  OperatorDialogTabs,
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

  const saveMutation = useMutation({
    mutationFn: () =>
      profile
        ? updateInventoryCostProfile(
            wsId,
            profile.id,
            buildProfilePayload(form)
          )
        : createInventoryCostProfile(wsId, buildProfilePayload(form)),
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

  const canSave = Boolean(form.name.trim() && form.targetRetailPrice);

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
          <OperatorDialogTabs
            tabs={[
              {
                content: (
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
                        setForm((current) => ({
                          ...current,
                          targetRetailPrice,
                        }))
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
                ),
                icon: <Settings2 className="h-4 w-4" />,
                label: forms('tabs.details'),
                value: 'details',
              },
              {
                content: (
                  <CostingScenariosEditor
                    onChange={(scenarios) =>
                      setForm((current) => ({ ...current, scenarios }))
                    }
                    scenarios={form.scenarios}
                  />
                ),
                icon: <Layers3 className="h-4 w-4" />,
                label: forms('tabs.scenarios'),
                value: 'scenarios',
              },
              {
                content: (
                  <CostingProfitSharesEditor
                    onChange={(profitShares) =>
                      setForm((current) => ({ ...current, profitShares }))
                    }
                    shares={form.profitShares}
                  />
                ),
                icon: <PieChart className="h-4 w-4" />,
                label: forms('tabs.profitShares'),
                value: 'profit-shares',
              },
              ...(isEdit
                ? [
                    {
                      content: (
                        <LifecyclePanel
                          archivePending={archiveMutation.isPending}
                          deletePending={deleteMutation.isPending}
                          onArchive={() => archiveMutation.mutate()}
                          onDelete={() => deleteMutation.mutate()}
                          title={forms('lifecycle')}
                        />
                      ),
                      icon: <ClipboardList className="h-4 w-4" />,
                      label: forms('tabs.lifecycle'),
                      value: 'lifecycle',
                    },
                  ]
                : []),
            ]}
          />
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
