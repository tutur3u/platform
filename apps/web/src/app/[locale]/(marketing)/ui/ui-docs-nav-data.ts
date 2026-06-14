import { getTranslations } from 'next-intl/server';
import { componentDocs, componentDocsByCategory } from './component-docs';
import type { ShowcaseCategory } from './component-registry';

/**
 * Minimal, serializable projection of the component registry for the client
 * sidebar / command palette. The heavy {@link componentDocs} graph (install
 * commands, usage code, examples, API tables) stays on the server — only these
 * small tuples and pre-translated labels cross the client boundary.
 */
export interface SidebarItem {
  slug: string;
  name: string;
}

export interface SidebarGroup {
  category: ShowcaseCategory;
  label: string;
  items: SidebarItem[];
}

export interface SidebarLabels {
  overview: string;
  setup: string;
  components: string;
  contributing: string;
  search: string;
  searchPlaceholder: string;
  empty: string;
  emptyHint: string;
  menu: string;
  title: string;
  description: string;
  commandTrigger: string;
  commandPlaceholder: string;
  commandEmpty: string;
  commandHint: string;
}

export interface SidebarData {
  groups: SidebarGroup[];
  labels: SidebarLabels;
  total: number;
}

export async function buildSidebarData(
  locale: 'en' | 'vi'
): Promise<SidebarData> {
  const tNav = await getTranslations({
    locale,
    namespace: 'ui-showcase.docs.nav',
  });
  const tCommand = await getTranslations({
    locale,
    namespace: 'ui-showcase.docs.command',
  });
  const tCategories = await getTranslations({
    locale,
    namespace: 'ui-showcase.categories',
  });

  const groups: SidebarGroup[] = componentDocsByCategory.map((group) => ({
    category: group.category,
    label: tCategories(group.category),
    items: group.docs.map((doc) => ({ slug: doc.slug, name: doc.name })),
  }));

  return {
    groups,
    total: componentDocs.length,
    labels: {
      overview: tNav('overview'),
      setup: tNav('setup'),
      components: tNav('components'),
      contributing: tNav('contributing'),
      search: tNav('search'),
      searchPlaceholder: tNav('searchPlaceholder'),
      empty: tNav('empty'),
      emptyHint: tNav('emptyHint'),
      menu: tNav('menu'),
      title: tNav('title'),
      description: tNav('description'),
      commandTrigger: tCommand('trigger'),
      commandPlaceholder: tCommand('placeholder'),
      commandEmpty: tCommand('empty'),
      commandHint: tCommand('hint'),
    },
  };
}
