'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { type ProductStatusFilter, useProductCategories } from './hooks';

interface ProductsFiltersProps {
  categoryId?: string;
  onCategoryChange: (value?: string) => void;
  onStatusChange: (value: ProductStatusFilter) => void;
  status: ProductStatusFilter;
  wsId: string;
}

export function ProductsFilters({
  categoryId,
  onCategoryChange,
  onStatusChange,
  status,
  wsId,
}: ProductsFiltersProps) {
  const t = useTranslations();
  const { data: categories = [] } = useProductCategories(wsId);
  const sortedCategories = categories
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return (
    <>
      <Select
        value={status}
        onValueChange={(value) => onStatusChange(value as ProductStatusFilter)}
      >
        <SelectTrigger className="h-8 w-full bg-background sm:w-[160px]">
          <SelectValue
            placeholder={t('ws-inventory-products.filters.status')}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">{t('common.active')}</SelectItem>
          <SelectItem value="archived">{t('common.archived')}</SelectItem>
          <SelectItem value="all">{t('common.all')}</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={categoryId || 'all'}
        onValueChange={(value) =>
          onCategoryChange(value === 'all' ? undefined : value)
        }
      >
        <SelectTrigger className="h-8 w-full bg-background sm:w-[220px]">
          <SelectValue
            placeholder={t('ws-inventory-products.filters.category')}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('common.all')}</SelectItem>
          {sortedCategories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name ||
                t('ws-inventory-products.filters.uncategorized')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
