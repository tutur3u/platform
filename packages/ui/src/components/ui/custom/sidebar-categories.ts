/**
 * Single source of truth for how the root app sidebar is sectioned.
 *
 * Every navigable app belongs to exactly one category, and categories render
 * in the fixed order below. Nothing else assigns section labels: the sidebar
 * used to stamp a label on each item and print a header whenever two
 * neighbouring labels differed, so a saved per-user order interleaved items
 * from different groups and headers repeated. Grouping by this registry
 * makes that impossible.
 */
export const SIDEBAR_CATEGORIES = [
  {
    id: 'overview',
    collapsible: false,
    itemIds: ['dashboard'],
    showLabel: false,
  },
  {
    id: 'productivity',
    collapsible: true,
    itemIds: [
      'tasks',
      'calendar',
      'notes',
      'documents',
      'habits',
      'time_tracker',
      'forms',
      'personal_journal',
    ],
    showLabel: true,
  },
  {
    id: 'communication',
    collapsible: true,
    itemIds: ['mail', 'chat', 'meet', 'contacts'],
    showLabel: true,
  },
  {
    id: 'operations',
    collapsible: true,
    itemIds: ['finance', 'inventory', 'workforce', 'posts'],
    showLabel: true,
  },
  {
    id: 'files_content',
    collapsible: true,
    itemIds: ['drive', 'whiteboards'],
    showLabel: true,
  },
  {
    id: 'ai',
    collapsible: true,
    itemIds: ['mind', 'hive', 'ai_lab'],
    showLabel: true,
  },
  {
    id: 'utilities',
    collapsible: true,
    itemIds: [
      'qr_generator',
      'link_shortener',
      'polls',
      'google_workspace',
      'product-feedback',
    ],
    showLabel: true,
  },
] as const;

export type SidebarCategoryId = (typeof SIDEBAR_CATEGORIES)[number]['id'];

export const SIDEBAR_FALLBACK_CATEGORY: SidebarCategoryId = 'utilities';

const categoryRank = new Map<string, number>(
  SIDEBAR_CATEGORIES.map((category, index) => [category.id, index])
);

const itemCategory = new Map<string, SidebarCategoryId>();
const itemRank = new Map<string, number>();

for (const category of SIDEBAR_CATEGORIES) {
  category.itemIds.forEach((itemId, index) => {
    itemCategory.set(itemId, category.id);
    itemRank.set(itemId, index);
  });
}

export function getSidebarCategory(itemId?: string | null): SidebarCategoryId {
  return (itemId && itemCategory.get(itemId)) || SIDEBAR_FALLBACK_CATEGORY;
}

/** Default position of an item inside its category (unknown items sort last). */
export function getSidebarItemRank(itemId?: string | null): number {
  if (!itemId) return Number.MAX_SAFE_INTEGER;
  return itemRank.get(itemId) ?? Number.MAX_SAFE_INTEGER;
}

export function getSidebarCategoryRank(categoryId: SidebarCategoryId): number {
  return categoryRank.get(categoryId) ?? SIDEBAR_CATEGORIES.length;
}

export function getSidebarCategoryDefinition(categoryId: SidebarCategoryId) {
  return SIDEBAR_CATEGORIES[getSidebarCategoryRank(categoryId)]!;
}
