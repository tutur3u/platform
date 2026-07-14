export type InventoryNavigationItem = {
  titleKey: string;
  href: string;
  aliases?: string[];
  sectionKey?: string;
  matchExact?: boolean;
  icon:
    | 'audits'
    | 'bundles'
    | 'catalog'
    | 'commerce'
    | 'costing'
    | 'overview'
    | 'polar'
    | 'promotions'
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
      aliases: [
        `/${workspaceSlug}/checkout`,
        `/${workspaceSlug}/checkouts`,
        `/${workspaceSlug}/sales`,
      ],
      icon: 'commerce',
      sectionKey: 'sections.commerce',
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
      titleKey: 'polar.title',
      href: `/${workspaceSlug}/polar`,
      icon: 'polar',
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
