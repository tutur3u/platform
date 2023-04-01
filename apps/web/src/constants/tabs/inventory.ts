import { NavTabs } from '../../types/Tab';

export const inventoryTabs: NavTabs = {
  namespace: 'inventory-tabs',
  tabs: [
    {
      name: 'overview',
      href: '/[wsId]/inventory',
    },
    {
      name: 'products',
      href: '/[wsId]/inventory/products',
    },
    {
      name: 'product-categories',
      href: '/[wsId]/inventory/categories',
    },
    {
      name: 'batches',
      href: '/[wsId]/inventory/batches',
    },
    {
      name: 'warehouses',
      href: '/[wsId]/inventory/warehouses',
    },
    {
      name: 'units',
      href: '/[wsId]/inventory/units',
    },
    {
      name: 'suppliers',
      href: '/[wsId]/inventory/suppliers',
    },
  ],
};
