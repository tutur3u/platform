'use client';

import { ListFilter, RotateCcw } from '@tuturuuu/icons';
import type {
  InventoryProductFormOptionsResponse,
  InventorySaleSummary,
} from '@tuturuuu/internal-api/inventory';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogClose, DialogTrigger } from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import {
  OperatorDialogBody,
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
} from './operator-dialog-shell';
import { SelectField, SelectValueField } from './operator-form-fields';
import type { InventoryFilters } from './operator-types';

type FilterPatch = Partial<InventoryFilters>;

export function OperatorAdvancedFilters({
  filters,
  mode,
  options,
  sales = [],
  setFilters,
}: {
  filters: InventoryFilters;
  mode: 'products' | 'sales';
  options?: InventoryProductFormOptionsResponse;
  sales?: InventorySaleSummary[];
  setFilters: (value: FilterPatch) => unknown;
}) {
  const t = useTranslations('inventory.operator.filters');
  const creators = [
    ...new Set(
      sales
        .map((sale) => sale.creator_name?.trim())
        .filter((name): name is string => Boolean(name))
    ),
  ].map((name) => ({ id: name, name }));
  const activeValues =
    mode === 'products'
      ? [
          filters.productCategory,
          filters.productOwner,
          filters.productWarehouse,
        ]
      : [filters.saleCategory, filters.saleCreator, filters.saleWarehouse];
  const sortActive =
    mode === 'products'
      ? filters.productSort !== 'created-desc'
      : filters.saleSort !== 'date-desc';
  const activeCount =
    activeValues.filter(Boolean).length + (sortActive ? 1 : 0);
  const reset = () =>
    setFilters(
      mode === 'products'
        ? {
            productCategory: '',
            productOwner: '',
            productSort: 'created-desc',
            productWarehouse: '',
          }
        : {
            saleCategory: '',
            saleCreator: '',
            saleSort: 'date-desc',
            saleWarehouse: '',
          }
    );
  const fields = (
    <div className="grid min-w-0 gap-3 md:grid-cols-4">
      {mode === 'products' ? (
        <>
          <SelectField
            label={t('category')}
            onChange={(productCategory) => setFilters({ productCategory })}
            options={options?.categories}
            placeholder={t('allCategories')}
            value={filters.productCategory}
          />
          <SelectField
            label={t('owner')}
            onChange={(productOwner) => setFilters({ productOwner })}
            options={options?.owners}
            placeholder={t('allOwners')}
            value={filters.productOwner}
          />
          <SelectField
            label={t('warehouse')}
            onChange={(productWarehouse) => setFilters({ productWarehouse })}
            options={options?.warehouses}
            placeholder={t('allWarehouses')}
            value={filters.productWarehouse}
          />
          <SelectValueField
            allowEmpty={false}
            label={t('sort')}
            onChange={(productSort) => setFilters({ productSort })}
            options={[
              { label: t('newest'), value: 'created-desc' },
              { label: t('oldest'), value: 'created-asc' },
              { label: t('nameAsc'), value: 'name-asc' },
              { label: t('nameDesc'), value: 'name-desc' },
            ]}
            placeholder={t('newest')}
            value={filters.productSort}
          />
        </>
      ) : (
        <>
          <SelectField
            label={t('creator')}
            onChange={(saleCreator) => setFilters({ saleCreator })}
            options={creators}
            placeholder={t('allCreators')}
            value={filters.saleCreator}
          />
          <SelectField
            label={t('category')}
            onChange={(saleCategory) => setFilters({ saleCategory })}
            options={(options?.financeCategories ?? []).flatMap((category) =>
              category.id ? [{ id: category.id, name: category.name }] : []
            )}
            placeholder={t('allCategories')}
            value={filters.saleCategory}
          />
          <SelectField
            label={t('warehouse')}
            onChange={(saleWarehouse) => setFilters({ saleWarehouse })}
            options={options?.warehouses}
            placeholder={t('allWarehouses')}
            value={filters.saleWarehouse}
          />
          <SelectValueField
            allowEmpty={false}
            label={t('sort')}
            onChange={(saleSort) => setFilters({ saleSort })}
            options={[
              { label: t('newest'), value: 'date-desc' },
              { label: t('oldest'), value: 'date-asc' },
              { label: t('amountHigh'), value: 'amount-desc' },
              { label: t('amountLow'), value: 'amount-asc' },
              { label: t('quantityHigh'), value: 'quantity-desc' },
            ]}
            placeholder={t('newest')}
            value={filters.saleSort}
          />
        </>
      )}
    </div>
  );

  return (
    <div className="min-w-0 rounded-lg border bg-card p-2">
      <div className="hidden items-end gap-2 md:grid md:grid-cols-[minmax(0,1fr)_auto]">
        {fields}
        <Button disabled={activeCount === 0} onClick={reset} variant="ghost">
          <RotateCcw className="h-4 w-4" />
          {t('clear')}
        </Button>
      </div>
      <Dialog>
        <DialogTrigger asChild>
          <Button
            className="w-full justify-between md:hidden"
            variant="outline"
          >
            <span className="inline-flex items-center gap-2">
              <ListFilter className="h-4 w-4" />
              {t('title')}
            </span>
            {activeCount > 0 ? (
              <Badge variant="secondary">{activeCount}</Badge>
            ) : null}
          </Button>
        </DialogTrigger>
        <OperatorDialogContent mobileFullscreen size="sm">
          <OperatorDialogHeader
            description={t('description')}
            title={t('title')}
          />
          <OperatorDialogBody>{fields}</OperatorDialogBody>
          <OperatorDialogFooter>
            <Button
              disabled={activeCount === 0}
              onClick={reset}
              variant="ghost"
            >
              <RotateCcw className="h-4 w-4" />
              {t('clear')}
            </Button>
            <DialogClose asChild>
              <Button>{t('done')}</Button>
            </DialogClose>
          </OperatorDialogFooter>
        </OperatorDialogContent>
      </Dialog>
    </div>
  );
}
