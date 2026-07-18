'use client';

import { Boxes, Building2 } from '@tuturuuu/icons';
import type {
  InventoryCostProfile,
  InventoryProductFormOptionsResponse,
  InventoryProductSummary,
} from '@tuturuuu/internal-api/inventory';
import {
  createInventoryUnit,
  createInventoryWarehouse,
  deleteInventoryUnit,
  deleteInventoryWarehouse,
  updateInventoryUnit,
  updateInventoryWarehouse,
} from '@tuturuuu/internal-api/inventory';
import { Accordion } from '@tuturuuu/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import type { InventoryStockTab } from './operator-types';
import { ProductsTable } from './products-table';
import type { ResourceConfig } from './setup-helpers';
import { ResourceSection } from './setup-resource-section';

const stockTabs = ['stock', 'warehouses'] as const;

export function StockWorkspacePanel({
  costingProfiles,
  formOptions,
  products,
  wsId,
}: {
  costingProfiles: InventoryCostProfile[];
  formOptions?: InventoryProductFormOptionsResponse;
  products: InventoryProductSummary[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.stockWorkspace');
  const setupText = useTranslations('inventory.operator.setup');
  const [tab, setTab] = useQueryState(
    'tab',
    parseAsStringLiteral(stockTabs)
      .withDefault('stock')
      .withOptions({ shallow: true })
  );
  const configs: ResourceConfig[] = [
    {
      create: (name) => createInventoryWarehouse(wsId, { name }),
      icon: Building2,
      key: 'warehouses',
      remove: (id) => deleteInventoryWarehouse(wsId, id),
      rows: formOptions?.warehouses ?? [],
      title: setupText('warehouses'),
      update: (id, name) => updateInventoryWarehouse(wsId, id, { name }),
    },
    {
      create: (name) => createInventoryUnit(wsId, { name }),
      icon: Boxes,
      key: 'units',
      remove: (id) => deleteInventoryUnit(wsId, id),
      rows: formOptions?.units ?? [],
      title: setupText('units'),
      update: (id, name) => updateInventoryUnit(wsId, id, { name }),
    },
  ];

  return (
    <Tabs
      className="grid min-w-0 gap-4"
      onValueChange={(nextTab) => {
        void setTab(nextTab as InventoryStockTab);
      }}
      value={tab}
    >
      <div className="overflow-x-auto">
        <TabsList className="h-auto w-max gap-1 bg-muted/40 p-1">
          <TabsTrigger className="gap-2 rounded-md px-3 py-2" value="stock">
            <Boxes className="h-4 w-4" />
            {t('tabs.stock')}
          </TabsTrigger>
          <TabsTrigger
            className="gap-2 rounded-md px-3 py-2"
            value="warehouses"
          >
            <Building2 className="h-4 w-4" />
            {t('tabs.warehouses')}
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent className="mt-0" value="stock">
        <ProductsTable
          costingProfiles={costingProfiles}
          formOptions={formOptions}
          rows={products}
          view="stock"
          wsId={wsId}
        />
      </TabsContent>
      <TabsContent className="mt-0" value="warehouses">
        <div className="grid min-w-0 gap-3">
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <h2 className="font-semibold text-sm">{t('warehousesTitle')}</h2>
            <p className="mt-1 text-muted-foreground text-sm leading-6">
              {t('warehousesDescription')}
            </p>
          </div>
          <Accordion
            className="grid min-w-0 gap-3 lg:grid-cols-2"
            type="multiple"
          >
            {configs.map((config) => (
              <ResourceSection config={config} key={config.key} wsId={wsId} />
            ))}
          </Accordion>
        </div>
      </TabsContent>
    </Tabs>
  );
}
