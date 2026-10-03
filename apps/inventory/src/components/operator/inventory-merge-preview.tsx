'use client';

import type { InventoryMergePreview } from '@tuturuuu/internal-api/inventory';
import { useTranslations } from 'next-intl';

export type InventoryMergeLabels = {
  products?: Array<{ id: string; name?: string | null }>;
  warehouses?: Array<{ id: string; name?: string | null }>;
  units?: Array<{ id: string; name?: string | null }>;
  categories?: Array<{ id: string; name?: string | null }>;
  owners?: Array<{ id: string; name?: string | null }>;
  manufacturers?: Array<{ id: string; name?: string | null }>;
  financeCategories?: Array<{ id: string; name?: string | null }>;
};

const fields = [
  'name',
  'description',
  'usage',
  'category_id',
  'owner_id',
  'manufacturer_id',
  'finance_category_id',
  'avatar_url',
] as const;
const lookup = {
  category_id: 'categories',
  owner_id: 'owners',
  manufacturer_id: 'manufacturers',
  finance_category_id: 'financeCategories',
} as const;

export function InventoryMergeMetadata({
  data,
  kind,
  labels,
}: {
  data: InventoryMergePreview;
  kind: 'product' | 'warehouse';
  labels?: InventoryMergeLabels;
}) {
  const t = useTranslations('inventory.operator.merge');
  const display = (field: (typeof fields)[number], value: unknown) => {
    if (value == null || value === '') return t('notSet');
    if (typeof value !== 'string') return String(value);
    if (field in lookup) {
      const key = lookup[field as keyof typeof lookup];
      return labels?.[key]?.find((row) => row.id === value)?.name || value;
    }
    return value;
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {(['source', 'target'] as const).map((side) => (
        <section key={side} className="min-w-0 rounded-md border p-3">
          <h3 className="mb-2 font-semibold text-sm">
            {t(side === 'source' ? 'source' : 'destination')}
          </h3>
          <dl className="grid gap-2 text-sm">
            {(kind === 'warehouse' ? fields.slice(0, 1) : fields).map(
              (field) => (
                <div key={field} className="grid gap-0.5">
                  <dt className="text-muted-foreground">
                    {t(`fields.${field}`)}
                  </dt>
                  <dd className="[overflow-wrap:anywhere]">
                    {display(
                      field,
                      data[side].metadata[field] ??
                        (field === 'name' ? data[side].name : null)
                    )}
                  </dd>
                </div>
              )
            )}
          </dl>
        </section>
      ))}
    </div>
  );
}

export function InventoryMergeBlocker({ code }: { code: string }) {
  const t = useTranslations('inventory.operator.merge');
  const kind = code.split(':')[0];
  const known = [
    'mixed_unlimited_stock',
    'active_reservations',
    'scheduled_prices',
    'cross_workspace_reference',
    'unsupported_composite_reference',
    'duplicate_reference',
    'unsupported_unique_key',
  ];
  const related = code.split(':')[1]?.split('.').at(-1);
  const resources: Record<string, string> = {
    inventory_square_catalog_links: 'square',
    inventory_storefront_listing_variants: 'variants',
    inventory_storefront_listings: 'listings',
    inventory_bundle_components: 'bundles',
    inventory_sales_period_products: 'periods',
    user_group_linked_products: 'groups',
  };
  return (
    <>
      {t(`blockers.${kind && known.includes(kind) ? kind : 'unknown'}`, {
        resource: t(
          `resources.${related && resources[related] ? resources[related] : 'related'}`
        ),
      })}
    </>
  );
}
