import type { Track } from '../../live/status.ts';

export const inventoryTrack: Track = {
  id: 'inventory',
  name: 'Inventory & Storefront',
  summary: 'Stock, catalog, sales periods and checkout for shops and counters.',
  milestones: [
    {
      id: 'inventory-sales',
      title: 'Sales periods and pricing',
      deliverables: [
        {
          id: 'inventory-season-prices',
          title: 'Season prices and all-or-nothing checkout',
          prs: [5669],
          app: 'inventory',
          fallback: 'planned',
        },
        {
          id: 'inventory-merge-periods',
          title: 'Merge sales periods with a conflict review',
          prs: [5770],
          app: 'inventory',
          fallback: 'planned',
        },
        {
          id: 'inventory-keep-period',
          title: 'Your chosen sales period stays selected between sales',
          prs: [7820, 7822],
          app: 'inventory',
          fallback: 'planned',
        },
        {
          id: 'inventory-default-period',
          title: 'Optionally make new sales periods the default',
          prs: [7825],
          app: 'inventory',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'inventory-catalog',
      title: 'A tidier catalog',
      deliverables: [
        {
          id: 'inventory-merge-products',
          title: 'Merge duplicate products and warehouses safely',
          prs: [5765],
          app: 'inventory',
          fallback: 'planned',
        },
        {
          id: 'inventory-sale-picker',
          title: 'Faster sale item picker and one checkout flow',
          prs: [5793, 5794],
          app: 'inventory',
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'inventory-mobile',
      title: 'Inventory on mobile',
      deliverables: [
        {
          id: 'inventory-mobile-offline-checkout',
          title: 'Offline data and safe checkout on mobile',
          prs: [5734],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'inventory-mobile-insights',
          title: 'Redesigned inventory insights on mobile',
          prs: [5771],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'inventory-mobile-auto-sync',
          title: 'Mobile inventory changes sync in the right order',
          prs: [5743],
          app: null,
          fallback: 'planned',
        },
      ],
    },
    {
      id: 'inventory-earlier',
      title: 'Earlier: Inventory foundations',
      summary: '2023 to early 2026.',
      deliverables: [
        {
          id: 'inventory-first-release',
          title: 'First inventory module with products and stock',
          prs: [373, 380],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'inventory-pages-i18n',
          title: 'Inventory pages in English and Vietnamese',
          prs: [964],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'inventory-product-management',
          title: 'Product management page',
          prs: [1929],
          app: null,
          fallback: 'planned',
        },
        {
          id: 'inventory-stock-control',
          title: 'Better stock management and stock permissions',
          prs: [3583, 4252, 4263],
          app: null,
          fallback: 'planned',
        },
      ],
    },
  ],
};
