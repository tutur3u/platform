'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Plus, Trash2 } from '@tuturuuu/icons';
import type {
  InventoryProductFormOptionsResponse,
  InventoryProductInventoryItem,
  InventoryProductSummary,
} from '@tuturuuu/internal-api/inventory';
import {
  createInventoryOwner,
  createInventoryUnit,
  createInventoryWarehouse,
  listInventoryStockBeneficiaries,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { useDebounce } from '@tuturuuu/ui/hooks/use-debounce';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FormSection } from './operator-dialog-shell';
import {
  NumberField,
  SelectField,
  TextAreaField,
  ToggleField,
} from './operator-form-fields';
import { stockAmountFromRecords } from './operator-stock';

export type ProductStockRowState = {
  amount: string;
  existing: boolean;
  key: string;
  minAmount: string;
  price: string;
  revenueSharePartnerId: string;
  revenueShareSplitPercent: string;
  unitId: string;
  unlimitedStock: boolean;
  warehouseId: string;
};

export type ProductStockSaveState = {
  canSave: boolean;
  duplicateTargets: boolean;
  incompleteTargets: boolean;
  inventory: InventoryProductInventoryItem[];
  shouldSave: boolean;
};

export type ProductStockChangeContextState = {
  beneficiaryId: string;
  note: string;
};

export function getInitialProductStockRows(
  product: InventoryProductSummary
): ProductStockRowState[] {
  const inventoryRows = product.inventory ?? [];

  if (!inventoryRows.length) return [createDraftStockRow('draft:initial')];

  return inventoryRows.map((inventory, index) => {
    const amount = stockAmountFromRecords(inventory, product.stock?.[index]);
    const unitId = stringField(inventory, 'unit_id');
    const warehouseId = stringField(inventory, 'warehouse_id');

    return {
      amount: amount == null ? '' : String(amount),
      existing: true,
      key: `${warehouseId || 'missing-warehouse'}:${unitId || 'missing-unit'}:${index}`,
      minAmount: String(numberOrDefault(inventory.min_amount, 0)),
      price: String(numberOrDefault(inventory.price, 0)),
      revenueSharePartnerId: stringField(inventory, 'revenue_share_partner_id'),
      revenueShareSplitPercent: String(
        numberOrDefault(inventory.revenue_share_bps, 0) / 100
      ),
      unitId,
      unlimitedStock: amount === null,
      warehouseId,
    };
  });
}

export function getProductStockSaveState(
  rows: ProductStockRowState[],
  initialHadStockRows: boolean
): ProductStockSaveState {
  const activeRows = rows.filter(hasStockRowInput);
  const completedRows = activeRows.filter(
    (row) => row.unitId && row.warehouseId
  );
  const targetKeys = completedRows.map(
    (row) => `${row.warehouseId}:${row.unitId}`
  );
  const duplicateTargets = new Set(targetKeys).size !== targetKeys.length;
  const incompleteTargets = activeRows.length !== completedRows.length;
  const inventory = completedRows.map((row) => ({
    amount: row.unlimitedStock ? null : Number(row.amount || 0),
    min_amount: Number(row.minAmount || 0),
    price: Number(row.price || 0),
    revenue_share_bps: Math.round(
      Number(row.revenueShareSplitPercent || 0) * 100
    ),
    revenue_share_partner_id: row.revenueSharePartnerId || null,
    unit_id: row.unitId,
    warehouse_id: row.warehouseId,
  }));

  return {
    canSave: !duplicateTargets && !incompleteTargets,
    duplicateTargets,
    incompleteTargets,
    inventory,
    shouldSave: initialHadStockRows || activeRows.length > 0,
  };
}

export function ProductStockEditor({
  changeContext,
  onChangeContext,
  onRowsChange,
  options,
  rows,
  saveState,
  wsId,
}: {
  changeContext: ProductStockChangeContextState;
  onChangeContext: (context: ProductStockChangeContextState) => void;
  onRowsChange: (rows: ProductStockRowState[]) => void;
  options?: InventoryProductFormOptionsResponse;
  rows: ProductStockRowState[];
  saveState: ProductStockSaveState;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const createText = (resource: string) => t('createOption', { resource });
  const creatingText = (resource: string) => t('creatingOption', { resource });
  const searchText = (resource: string) => t('searchOptions', { resource });
  const createReference = async (create: () => Promise<unknown>) => {
    try {
      const result = await create();
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'form-options'],
      });
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('saveError'));
      throw error;
    }
  };
  const updateRow = (
    key: string,
    updater: (row: ProductStockRowState) => ProductStockRowState
  ) => onRowsChange(rows.map((row) => (row.key === key ? updater(row) : row)));
  const removeRow = (key: string) => {
    if (rows.length <= 1) return;
    onRowsChange(rows.filter((row) => row.key !== key));
  };

  return (
    <div className="grid min-w-0 gap-4">
      {saveState.incompleteTargets ? (
        <p className="rounded-md border border-border bg-muted/20 px-3 py-2 text-muted-foreground text-xs leading-5">
          {t('stockTargetHint')}
        </p>
      ) : null}
      {saveState.duplicateTargets ? (
        <p className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-destructive text-xs leading-5">
          {t('duplicateStockTargetHint')}
        </p>
      ) : null}
      {rows.length > 0
        ? rows.map((row, index) => (
            <FormSection
              className="rounded-lg border border-border bg-muted/15 p-3"
              description={t('stockRowDescription')}
              icon={<Boxes className="h-4 w-4" />}
              key={row.key}
              title={t('stockRowTitle', { index: index + 1 })}
            >
              <div className="grid min-w-0 gap-3">
                {rows.length > 1 ? (
                  <div className="flex justify-end">
                    <Button
                      onClick={() => removeRow(row.key)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t('removeStockRow')}
                    </Button>
                  </div>
                ) : null}
                <div className="grid min-w-0 gap-3 lg:grid-cols-3">
                  <ToggleField
                    checked={row.unlimitedStock}
                    className="items-start lg:col-span-3"
                    onChange={(unlimitedStock) =>
                      updateRow(row.key, (current) => ({
                        ...current,
                        amount: unlimitedStock ? '' : current.amount,
                        unlimitedStock,
                      }))
                    }
                  >
                    <span className="grid gap-1">
                      <span className="font-medium">{t('unlimitedStock')}</span>
                      <span className="text-muted-foreground text-xs">
                        {t('unlimitedStockDescription')}
                      </span>
                    </span>
                  </ToggleField>
                  <SelectField
                    createText={createText(t('unit'))}
                    creatingText={creatingText(t('unit'))}
                    emptyText={t('emptyOptions')}
                    hint={t('hints.unit')}
                    label={t('unit')}
                    onChange={(unitId) =>
                      updateRow(row.key, (current) => ({ ...current, unitId }))
                    }
                    onCreate={(name) =>
                      createReference(() => createInventoryUnit(wsId, { name }))
                    }
                    options={options?.units}
                    placeholder={t('placeholders.unit')}
                    searchPlaceholder={searchText(t('unit'))}
                    value={row.unitId}
                  />
                  <SelectField
                    createText={createText(t('warehouse'))}
                    creatingText={creatingText(t('warehouse'))}
                    emptyText={t('emptyOptions')}
                    hint={t('hints.warehouse')}
                    label={t('warehouse')}
                    onChange={(warehouseId) =>
                      updateRow(row.key, (current) => ({
                        ...current,
                        warehouseId,
                      }))
                    }
                    onCreate={(name) =>
                      createReference(() =>
                        createInventoryWarehouse(wsId, { name })
                      )
                    }
                    options={options?.warehouses}
                    placeholder={t('placeholders.warehouse')}
                    searchPlaceholder={searchText(t('warehouse'))}
                    value={row.warehouseId}
                  />
                  <NumberField
                    disabled={row.unlimitedStock}
                    hint={t('hints.amount')}
                    label={t('amount')}
                    onChange={(amount) =>
                      updateRow(row.key, (current) => ({ ...current, amount }))
                    }
                    placeholder={
                      row.unlimitedStock
                        ? t('unlimitedStock')
                        : t('placeholders.amount')
                    }
                    value={row.amount}
                  />
                  <NumberField
                    hint={t('hints.minAmount')}
                    label={t('minAmount')}
                    onChange={(minAmount) =>
                      updateRow(row.key, (current) => ({
                        ...current,
                        minAmount,
                      }))
                    }
                    placeholder={t('placeholders.minAmount')}
                    value={row.minAmount}
                  />
                  <NumberField
                    hint={t('hints.price')}
                    label={t('price')}
                    onChange={(price) =>
                      updateRow(row.key, (current) => ({ ...current, price }))
                    }
                    placeholder={t('placeholders.price')}
                    value={row.price}
                  />
                  <SelectField
                    className="lg:col-span-2"
                    createText={createText(t('revenueSharePartner'))}
                    creatingText={creatingText(t('revenueSharePartner'))}
                    emptyText={t('emptyOptions')}
                    hint={t('hints.revenueSharePartner')}
                    label={t('revenueSharePartner')}
                    onChange={(revenueSharePartnerId) =>
                      updateRow(row.key, (current) => ({
                        ...current,
                        revenueSharePartnerId,
                      }))
                    }
                    onCreate={(name) =>
                      createReference(() =>
                        createInventoryOwner(wsId, { name })
                      )
                    }
                    options={options?.owners}
                    placeholder={t('placeholders.revenueSharePartner')}
                    searchPlaceholder={searchText(t('revenueSharePartner'))}
                    value={row.revenueSharePartnerId}
                  />
                  <NumberField
                    hint={t('hints.revenueShareSplitPercent')}
                    label={t('revenueShareSplitPercent')}
                    onChange={(revenueShareSplitPercent) =>
                      updateRow(row.key, (current) => ({
                        ...current,
                        revenueShareSplitPercent,
                      }))
                    }
                    placeholder={t('placeholders.revenueShareSplitPercent')}
                    value={row.revenueShareSplitPercent}
                  />
                </div>
              </div>
            </FormSection>
          ))
        : null}
      <div>
        <Button
          onClick={() =>
            onRowsChange([...rows, createDraftStockRow(`draft:${Date.now()}`)])
          }
          type="button"
          variant="outline"
        >
          <Plus className="h-4 w-4" />
          {t('addStockRow')}
        </Button>
      </div>
      <FormSection
        className="rounded-lg border border-border bg-muted/15 p-3"
        description={t('stockChangeContextDescription')}
        title={t('stockChangeContext')}
      >
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          <StockBeneficiaryField
            onChange={(beneficiaryId) =>
              onChangeContext({ ...changeContext, beneficiaryId })
            }
            value={changeContext.beneficiaryId}
            wsId={wsId}
          />
          <TextAreaField
            className="lg:col-span-2"
            hint={t('hints.stockChangeNote')}
            label={t('stockChangeNote')}
            maxLength={500}
            onChange={(note) => onChangeContext({ ...changeContext, note })}
            placeholder={t('placeholders.stockChangeNote')}
            value={changeContext.note}
          />
          <p className="text-muted-foreground text-xs lg:col-span-2">
            {t('stockChangeNoteLimit', { count: changeContext.note.length })}
          </p>
        </div>
      </FormSection>
    </div>
  );
}

function StockBeneficiaryField({
  onChange,
  value,
  wsId,
}: {
  onChange: (value: string) => void;
  value: string;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const [search, setSearch] = useState('');
  const [debouncedSearch] = useDebounce(search, 250);
  const [selectedOption, setSelectedOption] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const beneficiaries = useQuery({
    queryFn: () =>
      listInventoryStockBeneficiaries(wsId, {
        limit: 20,
        q: debouncedSearch.trim() || undefined,
      }),
    queryKey: [
      'inventory',
      wsId,
      'stock-beneficiaries',
      debouncedSearch.trim(),
    ],
  });
  const options = beneficiaries.data?.data.map((person) => ({
    id: person.id,
    name: person.name ?? person.email ?? person.id,
  }));
  const mergedOptions = [
    ...(selectedOption && !options?.some((option) => option.id === value)
      ? [selectedOption]
      : []),
    ...(options ?? []),
  ];

  return (
    <SelectField
      className="lg:col-span-2"
      emptyText={
        beneficiaries.isError ? t('beneficiarySearchError') : t('emptyOptions')
      }
      hint={t('hints.stockChangeBeneficiary')}
      label={t('stockChangeBeneficiary')}
      onChange={(nextValue) => {
        const option = mergedOptions.find((item) => item.id === nextValue);
        setSelectedOption(option ?? null);
        onChange(nextValue);
      }}
      onSearchChange={setSearch}
      options={mergedOptions}
      placeholder={t('placeholders.stockChangeBeneficiary')}
      searchPlaceholder={t('searchBeneficiaries')}
      value={value}
    />
  );
}

function createDraftStockRow(key: string): ProductStockRowState {
  return {
    amount: '',
    existing: false,
    key,
    minAmount: '',
    price: '',
    revenueSharePartnerId: '',
    revenueShareSplitPercent: '',
    unitId: '',
    unlimitedStock: false,
    warehouseId: '',
  };
}

function hasStockRowInput(row: ProductStockRowState) {
  return Boolean(
    row.amount.trim() ||
      row.minAmount.trim() ||
      row.price.trim() ||
      row.revenueSharePartnerId ||
      row.revenueShareSplitPercent.trim() ||
      row.unitId ||
      row.unlimitedStock ||
      row.warehouseId
  );
}

function numberOrDefault(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return fallback;
}

function stringField(record: Record<string, unknown>, key: string) {
  const value = record[key];

  return typeof value === 'string' ? value : '';
}
