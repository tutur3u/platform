export type InventoryNavigationItem = {
  titleKey: string;
  href: string;
  aliases?: string[];
  sectionKey?: string;
  matchExact?: boolean;
  icon:
    | 'analytics'
    | 'audits'
    | 'bundles'
    | 'catalog'
    | 'commerce'
    | 'costing'
    | 'overview'
    | 'payments'
    | 'posDevices'
    | 'promotions'
    | 'sales'
    | 'setup'
    | 'stock'
    | 'storefront';
};

export function getInventoryNavigationItems({
  workspaceSlug,
}: {
  workspaceSlug: string;
}): (InventoryNavigationItem | null)[] {
  return [
    {
      titleKey: 'overview.title',
      href: `/${workspaceSlug}`,
      icon: 'overview',
      matchExact: true,
    },
    null,
    {
      titleKey: 'analytics.title',
      href: `/${workspaceSlug}/analytics`,
      icon: 'analytics',
    },
    null,
    {
      titleKey: 'catalog.title',
      href: `/${workspaceSlug}/catalog`,
      aliases: [`/${workspaceSlug}/items`],
      icon: 'catalog',
      sectionKey: 'sections.operations',
    },
    {
      titleKey: 'stock.title',
      href: `/${workspaceSlug}/stock`,
      icon: 'stock',
    },
    {
      titleKey: 'bundles.title',
      href: `/${workspaceSlug}/bundles`,
      icon: 'bundles',
    },
    {
      titleKey: 'costing.title',
      href: `/${workspaceSlug}/costing`,
      icon: 'costing',
    },
    null,
    {
      titleKey: 'commerce.title',
      href: `/${workspaceSlug}/commerce`,
      aliases: [`/${workspaceSlug}/checkout`, `/${workspaceSlug}/checkouts`],
      icon: 'commerce',
      sectionKey: 'sections.commerce',
    },
    {
      titleKey: 'sales.title',
      href: `/${workspaceSlug}/sales`,
      icon: 'sales',
    },
    {
      titleKey: 'promotions.title',
      href: `/${workspaceSlug}/promotions`,
      icon: 'promotions',
    },
    {
      titleKey: 'storefront.title',
      href: `/${workspaceSlug}/storefront`,
      aliases: [
        `/${workspaceSlug}/storefront/preview`,
        `/${workspaceSlug}/stripe`,
      ],
      icon: 'storefront',
    },
    {
      titleKey: 'payments.title',
      href: `/${workspaceSlug}/payments`,
      aliases: [`/${workspaceSlug}/polar`],
      icon: 'payments',
    },
    {
      titleKey: 'posDevices.title',
      href: `/${workspaceSlug}/pos-devices`,
      aliases: [`/${workspaceSlug}/terminals`],
      icon: 'posDevices',
    },
    null,
    {
      titleKey: 'setup.title',
      href: `/${workspaceSlug}/setup`,
      icon: 'setup',
      sectionKey: 'sections.controls',
    },
    {
      titleKey: 'audits.title',
      href: `/${workspaceSlug}/audits`,
      icon: 'audits',
    },
  ];
}
