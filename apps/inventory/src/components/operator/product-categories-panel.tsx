'use client';

import { Pencil, Tags } from '@tuturuuu/icons';
import {
  createInventoryProductCategory,
  deleteInventoryProductCategory,
  updateInventoryProductCategory,
} from '@tuturuuu/internal-api/inventory';
import type { ProductCategory } from '@tuturuuu/types/primitives/ProductCategory';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { InfiniteListFooter } from './operator-shell';
import type { ResourceConfig } from './setup-helpers';
import { ResourceDialog } from './setup-resource-section';

function categoryConfig(
  wsId: string,
  title: string,
  rows: ProductCategory[] = []
): ResourceConfig {
  return {
    create: (name) => createInventoryProductCategory(wsId, { name }),
    icon: Tags,
    key: 'categories',
    remove: (id) => deleteInventoryProductCategory(wsId, id),
    rows,
    title,
    update: (id, name) => updateInventoryProductCategory(wsId, id, { name }),
  };
}

export function ProductCategoryDialog({
  item,
  trigger,
  wsId,
}: {
  item?: ProductCategory;
  trigger: ReactNode;
  wsId: string;
}) {
  const setup = useTranslations('inventory.operator.setup');

  return (
    <ResourceDialog
      config={categoryConfig(wsId, setup('categories'))}
      item={item}
      trigger={trigger}
      wsId={wsId}
    />
  );
}

export function ProductCategoriesPanel({
  pagination,
  rows,
  wsId,
}: {
  pagination: {
    fetchNextPage: () => void;
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    totalCount: number;
  };
  rows: ProductCategory[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.catalogWorkspace.categories');
  const forms = useTranslations('inventory.operator.forms');

  return (
    <section className="grid min-w-0 gap-3">
      <div className="grid min-w-0 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Tags className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">{t('title')}</h2>
              <Badge variant="outline">
                {t('count', { count: pagination.totalCount })}
              </Badge>
            </div>
            <p className="mt-1 text-muted-foreground text-sm leading-6">
              {t('description')}
            </p>
          </div>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((category) => (
            <article
              className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border bg-card p-3"
              key={category.id}
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-sm">
                  {category.name ?? category.id}
                </p>
                <p className="mt-0.5 text-muted-foreground text-xs">
                  {t('rowDescription')}
                </p>
              </div>
              <ProductCategoryDialog
                item={category}
                trigger={
                  <Button
                    aria-label={`${forms('edit')}: ${category.name ?? category.id}`}
                    className="h-10 w-10 touch-manipulation sm:h-9 sm:w-9"
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                }
                wsId={wsId}
              />
            </article>
          ))}
        </div>
      ) : (
        <div className="grid min-h-40 place-items-center rounded-lg border border-border border-dashed bg-muted/20 p-6 text-center">
          <div className="max-w-md">
            <Tags className="mx-auto h-6 w-6 text-muted-foreground" />
            <h3 className="mt-3 font-medium">{t('emptyTitle')}</h3>
            <p className="mt-1 text-muted-foreground text-sm leading-6">
              {t('emptyDescription')}
            </p>
          </div>
        </div>
      )}

      <InfiniteListFooter
        hasNextPage={pagination.hasNextPage}
        isFetchingNextPage={pagination.isFetchingNextPage}
        loadedCount={rows.length}
        onLoadMore={pagination.fetchNextPage}
        totalCount={pagination.totalCount}
      />
    </section>
  );
}
