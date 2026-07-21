import type {
  LaunchableAppCategory,
  LaunchableAppSlug,
} from '@tuturuuu/utils/launchable-apps';

export type CatalogApp = {
  aliases: readonly string[];
  category: LaunchableAppCategory;
  description: string;
  href: string;
  slug: LaunchableAppSlug;
  title: string;
};

export type CatalogCategory = {
  description: string;
  label: string;
  slug: LaunchableAppCategory;
};

export type CatalogCopy = {
  allApps: string;
  clearSearch: string;
  emptyDescription: string;
  emptyTitle: string;
  openApp: string;
  searchPlaceholder: string;
};
