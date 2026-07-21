export interface MarketingProduct {
  /** Translation key under `marketing-nav.products.*`. */
  key: string;
  href: string;
  /** Static accent class — Tailwind cannot resolve interpolated names. */
  accent: string;
}

export interface MarketingProductGroup {
  /** Translation key under `marketing-nav.groups.*`. */
  key: string;
  items: MarketingProduct[];
}

/**
 * Product mega-menu contents.
 *
 * Kept out of `shared/navigation-config.tsx` on purpose: the public-shell
 * compile-graph test forbids a `products` category there, and this module is
 * only pulled in by the marketing navbar rather than every public route.
 *
 * Every entry points at a marketing `/products/*` page. The link into the
 * running app is the primary CTA on that page, so visitors always meet the
 * product before the product's login screen.
 */
export const MARKETING_PRODUCT_GROUPS: MarketingProductGroup[] = [
  {
    key: 'plan',
    items: [
      {
        key: 'calendar',
        href: '/products/calendar',
        accent: 'text-dynamic-blue',
      },
      { key: 'tasks', href: '/products/tasks', accent: 'text-dynamic-green' },
      {
        key: 'meet',
        href: '/products/meet-together',
        accent: 'text-dynamic-purple',
      },
      {
        key: 'workflows',
        href: '/products/workflows',
        accent: 'text-dynamic-cyan',
      },
      { key: 'track', href: '/products/track', accent: 'text-dynamic-orange' },
      { key: 'forms', href: '/products/forms', accent: 'text-dynamic-indigo' },
    ],
  },
  {
    key: 'create',
    items: [
      {
        key: 'documents',
        href: '/products/documents',
        accent: 'text-dynamic-orange',
      },
      { key: 'drive', href: '/products/drive', accent: 'text-dynamic-yellow' },
      { key: 'mail', href: '/products/mail', accent: 'text-dynamic-red' },
      { key: 'chat', href: '/products/chat', accent: 'text-dynamic-cyan' },
      { key: 'ai', href: '/products/ai', accent: 'text-dynamic-purple' },
      { key: 'qr', href: '/products/qr', accent: 'text-dynamic-sky' },
    ],
  },
  {
    key: 'operate',
    items: [
      {
        key: 'finance',
        href: '/products/finance',
        accent: 'text-dynamic-pink',
      },
      { key: 'crm', href: '/products/crm', accent: 'text-dynamic-blue' },
      {
        key: 'inventory',
        href: '/products/inventory',
        accent: 'text-dynamic-green',
      },
      {
        key: 'storefront',
        href: '/products/storefront',
        accent: 'text-dynamic-teal',
      },
      { key: 'hive', href: '/products/hive', accent: 'text-dynamic-rose' },
      { key: 'lms', href: '/products/lms', accent: 'text-dynamic-orange' },
    ],
  },
];
