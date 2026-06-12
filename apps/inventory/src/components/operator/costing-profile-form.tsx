'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calculator, Plus, Trash2 } from '@tuturuuu/icons';
import type { InventoryProductFormOptionsResponse } from '@tuturuuu/internal-api/inventory';
import { createInventoryCostProfile } from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';

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

export function CostingProfileForm({
  options,
  wsId,
}: {
  options?: InventoryProductFormOptionsResponse;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.costing');
  const forms = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [targetRetailPrice, setTargetRetailPrice] = useState('');
  const [scenarios, setScenarios] = useState<ScenarioInput[]>([
    defaultScenario(),
  ]);
  const createMutation = useMutation({
    mutationFn: () =>
      createInventoryCostProfile(wsId, {
        categoryId: categoryId || null,
        currency: 'USD',
        name,
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
      setName('');
      setCategoryId('');
      setTargetRetailPrice('');
      setScenarios([defaultScenario()]);
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
    },
  });

  return (
    <form
      className="rounded-lg border border-border bg-card p-4"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        if (name && targetRetailPrice) createMutation.mutate();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Calculator className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-medium text-sm">{t('newProfile')}</h2>
            <p className="text-muted-foreground text-xs">
              {t('summaryDescription')}
            </p>
          </div>
        </div>
        <Button
          disabled={!name || !targetRetailPrice || createMutation.isPending}
          type="submit"
        >
          <Plus className="h-4 w-4" />
          {t('saveProfile')}
        </Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px_160px]">
        <label className="grid gap-1">
          <span className="text-muted-foreground text-xs">{t('itemName')}</span>
          <input
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-muted-foreground text-xs">
            {forms('category')}
          </span>
          <select
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            onChange={(event) => setCategoryId(event.target.value)}
            value={categoryId}
          >
            <option value="">{t('uncategorized')}</option>
            {(options?.categories ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-muted-foreground text-xs">{t('retail')}</span>
          <input
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
            inputMode="decimal"
            onChange={(event) => setTargetRetailPrice(event.target.value)}
            value={targetRetailPrice}
          />
        </label>
      </div>
      <div className="mt-4 grid gap-2">
        {scenarios.map((scenario, index) => (
          <div
            className="grid gap-2 rounded-md border border-border p-2 md:grid-cols-[120px_1fr_1fr_auto]"
            key={index.toString()}
          >
            <input
              aria-label={t('batchSize')}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
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
              placeholder={t('batchSize')}
              value={scenario.batchSize}
            />
            <input
              aria-label={t('unitCost')}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              inputMode="decimal"
              onChange={(event) =>
                setScenarios((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index
                      ? {
                          ...item,
                          manufacturingCostPerUnit: event.target.value,
                        }
                      : item
                  )
                )
              }
              placeholder={t('unitCost')}
              value={scenario.manufacturingCostPerUnit}
            />
            <input
              aria-label={t('totalCost')}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm"
              inputMode="decimal"
              onChange={(event) =>
                setScenarios((current) =>
                  current.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, totalCostPerUnit: event.target.value }
                      : item
                  )
                )
              }
              placeholder={t('totalCost')}
              value={scenario.totalCostPerUnit}
            />
            <button
              className="inline-flex h-9 items-center justify-center rounded-md border border-destructive/30 px-3 text-destructive disabled:opacity-50"
              disabled={scenarios.length === 1}
              onClick={() =>
                setScenarios((current) =>
                  current.filter((_, itemIndex) => itemIndex !== index)
                )
              }
              type="button"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <Button
        className="mt-3"
        onClick={() =>
          setScenarios((current) => [...current, defaultScenario()])
        }
        type="button"
        variant="outline"
      >
        <Plus className="h-4 w-4" />
        {t('addScenario')}
      </Button>
    </form>
  );
}
