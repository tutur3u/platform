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
    | 'checkouts'
    | 'overview'
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
    null,
    {
      titleKey: 'checkouts.title',
      href: `/${workspaceSlug}/checkouts`,
      aliases: [`/${workspaceSlug}/checkout`],
      icon: 'checkouts',
      sectionKey: 'sections.commerce',
    },
    {
      titleKey: 'sales.title',
      href: `/${workspaceSlug}/sales`,
      icon: 'sales',
    },
    {
      titleKey: 'storefront.title',
      href: `/${workspaceSlug}/storefront`,
      aliases: [`/${workspaceSlug}/stripe`],
      icon: 'storefront',
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
