import { removeAccents } from '@tuturuuu/utils/text-helper';
import type {
  SettingsNavGroup,
  SettingsNavItem,
} from './settings-dialog-shell';

type IndexedSettingsNavItem = {
  groupLabel: string;
  item: SettingsNavItem;
  normalizedSearchText: string;
};

function normalizeSearchText(value: string) {
  return removeAccents(value.toLowerCase());
}

function getItemSearchText(groupLabel: string, item: SettingsNavItem) {
  return [
    groupLabel,
    item.name,
    item.label,
    item.description,
    ...(item.keywords ?? []),
    ...(item.aliases ?? []),
    ...(item.searchLabels ?? []),
  ]
    .filter(Boolean)
    .join(' ');
}

export function createSettingsSearchEngine(navItems: SettingsNavGroup[]) {
  const indexedItems: IndexedSettingsNavItem[] = navItems.flatMap((group) =>
    group.items.map((item) => ({
      groupLabel: group.label,
      item,
      normalizedSearchText: normalizeSearchText(
        getItemSearchText(group.label, item)
      ),
    }))
  );

  const allItems = indexedItems.map(({ item }) => item);

  function search(query: string) {
    const normalizedQuery = normalizeSearchText(query.trim());
    if (!normalizedQuery) return navItems;

    const matchesByName = new Set(
      indexedItems
        .filter(({ normalizedSearchText }) =>
          normalizedSearchText.includes(normalizedQuery)
        )
        .map(({ item }) => item.name)
    );

    return navItems
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => matchesByName.has(item.name)),
      }))
      .filter((group) => group.items.length > 0);
  }

  function getEnabledItems(query = '') {
    return search(query)
      .flatMap((group) => group.items)
      .filter((item) => !item.disabled);
  }

  return {
    allItems,
    getEnabledItems,
    search,
  };
}
