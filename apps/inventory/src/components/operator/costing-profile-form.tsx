'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calculator, Layers3, Plus, Trash2 } from '@tuturuuu/icons';
import type {
  InventoryProductFormOptionsResponse,
  InventoryProductSummary,
} from '@tuturuuu/internal-api/inventory';
import {
  createInventoryCostProfile,
  createInventoryProductCategory,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogClose, DialogTrigger } from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useState } from 'react';
import {
  FormSection,
  OperatorDialogBody,
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
} from './operator-dialog-shell';
import { FieldLabel, SelectField } from './operator-form-fields';
import { numberOrZero } from './operator-stock';

type ScenarioInput = {
  batchSize: string;
  manufacturingCostPerUnit: string;
  totalCostPerUnit: string;
};

const defaultScenario = (): ScenarioInput => ({
  batchSize: '30',
  manufacturingCostPerUnit: '',
  totalCostPerUnit: '',
});

function numeric(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function CostingProfileDialog({
  options,
  products,
  trigger,
  wsId,
}: {
  options?: InventoryProductFormOptionsResponse;
  products?: InventoryProductSummary[];
  trigger: ReactNode;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.costing');
  const forms = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState('');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [targetRetailPrice, setTargetRetailPrice] = useState('');
  const [scenarios, setScenarios] = useState<ScenarioInput[]>([
    defaultScenario(),
  ]);
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
  const createMutation = useMutation({
    mutationFn: () =>
      createInventoryCostProfile(wsId, {
        categoryId: categoryId || null,
        currency: 'USD',
        name,
        productId: productId || null,
        profitShares: [
          { recipientLabel: 'Talent', sharePercentage: 70, sortOrder: 0 },
          { recipientLabel: 'Partner', sharePercentage: 30, sortOrder: 1 },
        ],
        scenarios: scenarios.map((scenario, index) => {
          const manufacturingCostPerUnit = numeric(
            scenario.manufacturingCostPerUnit
          );
          const totalCostPerUnit = numeric(scenario.totalCostPerUnit);

          return {
            batchSize: Math.max(1, numeric(scenario.batchSize)),
            manufacturingCostPerUnit,
            name: `${scenario.batchSize || index + 1} units`,
            otherCostPerUnit: Math.max(
              totalCostPerUnit - manufacturingCostPerUnit,
              0
            ),
            sortOrder: index,
          };
        }),
        status: 'active',
        targetRetailPrice: numeric(targetRetailPrice),
      }),
    onError: () => toast.error(forms('saveError')),
    onSuccess: () => {
      toast.success(forms('saveSuccess'));
      setProductId('');
      setName('');
      setCategoryId('');
      setTargetRetailPrice('');
      setScenarios([defaultScenario()]);
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
    },
  });
  const canSubmit = Boolean(name && targetRetailPrice);
  const handleProductChange = (nextProductId: string) => {
    setProductId(nextProductId);

    const product = products?.find((item) => item.id === nextProductId);
    if (!product) return;

    setName((current) => current || product.name);
    setCategoryId((current) => current || product.category_id || '');
    setTargetRetailPrice((current) => {
      if (current) return current;

      const price = numberOrZero(product.inventory?.[0]?.price);
      return price > 0 ? String(price) : current;
    });
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <OperatorDialogContent size="lg">
        <OperatorDialogHeader
          description={t('summaryDescription')}
          title={t('newProfile')}
        />
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            if (canSubmit) createMutation.mutate();
          }}
        >
          <OperatorDialogBody className="grid gap-6">
            <FormSection
              description={t('steps.profileDescription')}
              icon={<Calculator className="h-4 w-4" />}
              title={t('steps.profile')}
            >
              <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_220px_160px]">
                <SelectField
                  allowEmpty
                  className="md:col-span-2 xl:col-span-1"
                  emptyText={forms('emptyOptions')}
                  label={forms('product')}
                  onChange={handleProductChange}
                  options={products}
                  placeholder={forms('placeholders.product')}
                  searchPlaceholder={forms('searchOptions', {
                    resource: forms('product'),
                  })}
                  value={productId}
                />
                <label className="grid min-w-0 gap-1 text-sm">
                  <FieldLabel label={t('itemName')} />
                  <Input
                    onChange={(event) => setName(event.target.value)}
                    placeholder={forms('placeholders.costingProfileName')}
                    value={name}
                  />
                </label>
                <SelectField
                  createText={forms('createOption', {
                    resource: forms('category'),
                  })}
                  creatingText={forms('creatingOption', {
                    resource: forms('category'),
                  })}
                  emptyText={forms('emptyOptions')}
                  hint={forms('hints.category')}
                  label={forms('category')}
                  onChange={setCategoryId}
                  onCreate={createCategory}
                  options={options?.categories}
                  placeholder={t('uncategorized')}
                  searchPlaceholder={forms('searchOptions', {
                    resource: forms('category'),
                  })}
                  value={categoryId}
                />
                <label className="grid min-w-0 gap-1 text-sm">
                  <FieldLabel
                    hint={forms('hints.retail')}
                    label={t('retail')}
                  />
                  <Input
                    inputMode="decimal"
                    onChange={(event) =>
                      setTargetRetailPrice(event.target.value)
                    }
                    placeholder={forms('placeholders.retail')}
                    value={targetRetailPrice}
                  />
                </label>
              </div>
            </FormSection>
            <FormSection
              description={t('steps.scenariosDescription')}
              icon={<Layers3 className="h-4 w-4" />}
              title={t('steps.scenarios')}
            >
              <div className="grid min-w-0 gap-2">
                <div className="hidden gap-2 px-1 md:grid md:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <FieldLabel
                    hint={forms('hints.batchSize')}
                    label={t('batchSize')}
                  />
                  <FieldLabel
                    hint={forms('hints.unitCost')}
                    label={t('unitCost')}
                  />
                  <FieldLabel
                    hint={forms('hints.totalCost')}
                    label={t('totalCost')}
                  />
                  <span aria-hidden="true" />
                </div>
                {scenarios.map((scenario, index) => (
                  <div
                    className="grid min-w-0 items-end gap-2 rounded-md border border-border p-2 md:grid-cols-[120px_minmax(0,1fr)_minmax(0,1fr)_auto]"
                    key={index.toString()}
                  >
                    <label className="grid min-w-0 gap-1 text-sm">
                      <span className="md:hidden">
                        <FieldLabel
                          hint={forms('hints.batchSize')}
                          label={t('batchSize')}
                        />
                      </span>
                      <Input
                        aria-label={t('batchSize')}
                        inputMode="numeric"
                        onChange={(event) =>
                          setScenarios((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, batchSize: event.target.value }
                                : item
                            )
                          )
                        }
                        placeholder={forms('placeholders.batchSize')}
                        value={scenario.batchSize}
                      />
                    </label>
                    <label className="grid min-w-0 gap-1 text-sm">
                      <span className="md:hidden">
                        <FieldLabel
                          hint={forms('hints.unitCost')}
                          label={t('unitCost')}
                        />
                      </span>
                      <Input
                        aria-label={t('unitCost')}
                        inputMode="decimal"
                        onChange={(event) =>
                          setScenarios((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    manufacturingCostPerUnit:
                                      event.target.value,
                                  }
                                : item
                            )
                          )
                        }
                        placeholder={forms('placeholders.unitCost')}
                        value={scenario.manufacturingCostPerUnit}
                      />
                    </label>
                    <label className="grid min-w-0 gap-1 text-sm">
                      <span className="md:hidden">
                        <FieldLabel
                          hint={forms('hints.totalCost')}
                          label={t('totalCost')}
                        />
                      </span>
                      <Input
                        aria-label={t('totalCost')}
                        inputMode="decimal"
                        onChange={(event) =>
                          setScenarios((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    totalCostPerUnit: event.target.value,
                                  }
                                : item
                            )
                          )
                        }
                        placeholder={forms('placeholders.totalCost')}
                        value={scenario.totalCostPerUnit}
                      />
                    </label>
                    <Button
                      aria-label={forms('delete')}
                      disabled={scenarios.length === 1}
                      onClick={() =>
                        setScenarios((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index)
                        )
                      }
                      size="icon"
                      type="button"
                      variant="destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                className="w-fit"
                onClick={() =>
                  setScenarios((current) => [...current, defaultScenario()])
                }
                type="button"
                variant="outline"
              >
                <Plus className="h-4 w-4" />
                {t('addScenario')}
              </Button>
            </FormSection>
          </OperatorDialogBody>
          <OperatorDialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {forms('cancel')}
              </Button>
            </DialogClose>
            <Button
              disabled={!canSubmit || createMutation.isPending}
              type="submit"
            >
              {createMutation.isPending ? forms('creating') : t('saveProfile')}
            </Button>
          </OperatorDialogFooter>
        </form>
      </OperatorDialogContent>
    </Dialog>
  );
}
