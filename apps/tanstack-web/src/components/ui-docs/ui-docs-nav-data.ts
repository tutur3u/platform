import { createUiDocsTranslator } from '../../data/ui-docs/messages';
import type { Locale } from '../../lib/platform/locale';
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
  fullDocs: string;
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

export function buildSidebarData(locale: Locale): SidebarData {
  const tDocs = createUiDocsTranslator(locale, 'docs');
  const tCategories = createUiDocsTranslator(locale, 'categories');

  const groups: SidebarGroup[] = componentDocsByCategory.map((group) => ({
    category: group.category,
    label: tCategories(group.category),
    items: group.docs.map((doc) => ({ slug: doc.slug, name: doc.name })),
  }));

  return {
    groups,
    total: componentDocs.length,
    labels: {
      overview: tDocs('nav.overview'),
      setup: tDocs('nav.setup'),
      components: tDocs('nav.components'),
      contributing: tDocs('nav.contributing'),
      fullDocs: tDocs('nav.fullDocs'),
      search: tDocs('nav.search'),
      searchPlaceholder: tDocs('nav.searchPlaceholder'),
      empty: tDocs('nav.empty'),
      emptyHint: tDocs('nav.emptyHint'),
      menu: tDocs('nav.menu'),
      title: tDocs('nav.title'),
      description: tDocs('nav.description'),
      commandTrigger: tDocs('command.trigger'),
      commandPlaceholder: tDocs('command.placeholder'),
      commandEmpty: tDocs('command.empty'),
      commandHint: tDocs('command.hint'),
    },
  };
}
