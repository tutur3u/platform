import type * as React from 'react';
import type { FlatNavItem } from './use-navigation-data';

export type CommandActionKind = 'navigate' | 'external' | 'panel';
export type CommandActionPanel = 'task-create' | 'time-tracker' | 'generic';

export interface CommandAction {
  id: string;
  kind: CommandActionKind;
  panel?: CommandActionPanel;
  title: string;
  description: string;
  href: string;
  targetHref: string;
  icon?: React.ReactNode;
  productId?: string;
  productTitle: string;
  path: string[];
  aliases: string[];
  external?: boolean;
  newTab?: boolean;
  priority: number;
}

export interface CommandActionLabels {
  createInProduct: (product: string) => string;
  createInProductDescription: (product: string) => string;
  manageProduct: (product: string) => string;
  manageProductDescription: (product: string) => string;
  openExternalItem: (item: string) => string;
  openExternalItemDescription: (item: string) => string;
  openItem: (item: string) => string;
  openItemDescription: (item: string) => string;
}

interface ProductGroup {
  key: string;
  id?: string;
  title: string;
  href: string;
  icon?: React.ReactNode;
  path: string[];
  items: FlatNavItem[];
  external?: boolean;
  newTab?: boolean;
}

const defaultLabels: CommandActionLabels = {
  createInProduct: (product) => `Create in ${product}`,
  createInProductDescription: (product) =>
    `Start a new ${product} workflow from the command palette.`,
  manageProduct: (product) => `Manage ${product}`,
  manageProductDescription: (product) =>
    `Open the primary ${product} workspace tools.`,
  openExternalItem: (item) => `Open ${item}`,
  openExternalItemDescription: (item) =>
    `${item} opens outside the main web app.`,
  openItem: (item) => `Open ${item}`,
  openItemDescription: (item) => `Navigate to ${item}.`,
};

const NON_CREATABLE_PRODUCT_IDS = new Set([
  'dashboard',
  'google_workspace',
  'qr_generator',
  'settings',
]);

const NON_CREATABLE_PRODUCT_TITLES = new Set(['dashboard', 'settings']);

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function appendPath(baseHref: string, suffix: string): string {
  const normalizedBase = baseHref.replace(/\/$/, '');
  return `${normalizedBase}${suffix}`;
}

function findItemHref(
  items: FlatNavItem[],
  matcher: (href: string) => boolean
) {
  return items.find((item) => matcher(item.href))?.href;
}

function getCreateTargetHref(group: ProductGroup): string {
  const { id, href, items } = group;

  switch (id) {
    case 'ai_lab':
      return `${(
        findItemHref(items, (itemHref) => itemHref.endsWith('/ai-chat')) ?? href
      ).replace(/\/$/, '')}/new`;
    case 'education':
      return appendPath(href, '/courses');
    case 'finance':
      return appendPath(href, '/transactions?create=transaction');
    case 'forms':
      return appendPath(href, '/new');
    case 'inventory':
      return appendPath(href, '/products/new');
    case 'meet':
      return appendPath(href, '/meetings');
    case 'mind':
      return appendPath(href, '/boards');
    case 'time_tracker':
      return appendPath(href, '/timer');
    case 'users':
      return appendPath(href, '/database');
    default:
      return href;
  }
}

function getPanelForProduct(group: ProductGroup): CommandActionPanel {
  if (group.id === 'tasks') return 'task-create';
  if (group.id === 'time_tracker') return 'time-tracker';
  return 'generic';
}

function isCreatableProduct(group: ProductGroup): boolean {
  if (group.external) return false;
  if (group.id && NON_CREATABLE_PRODUCT_IDS.has(group.id)) return false;

  return !NON_CREATABLE_PRODUCT_TITLES.has(group.title.toLowerCase());
}

function getProductGroups(navItems: FlatNavItem[]): ProductGroup[] {
  const groups = new Map<string, ProductGroup>();

  for (const item of navItems) {
    const title = item.productTitle || item.title;
    const key = item.productId || slugify(title);
    const href = item.productHref || item.href;

    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
      if (!existing.icon && item.icon) existing.icon = item.icon;
      if (!existing.href && href) existing.href = href;
      continue;
    }

    groups.set(key, {
      key,
      id: item.productId,
      title,
      href,
      icon: item.icon,
      path: item.path[0] === title ? [title] : [title, ...item.path],
      items: [item],
      external: item.external,
      newTab: item.newTab,
    });
  }

  return Array.from(groups.values());
}

function getAliases(group: ProductGroup): string[] {
  const aliases = new Set<string>();

  aliases.add(group.title);
  aliases.add(group.href);

  for (const item of group.items) {
    aliases.add(item.title);
    aliases.add(item.href);
    aliases.add(item.path.join(' '));

    for (const alias of item.aliases ?? []) {
      aliases.add(alias);
    }
  }

  return Array.from(aliases).filter(Boolean);
}

export function buildCommandActions(
  navItems: FlatNavItem[],
  labels: CommandActionLabels = defaultLabels
): CommandAction[] {
  const actions: CommandAction[] = [];
  const groups = getProductGroups(navItems);

  for (const group of groups) {
    const aliases = getAliases(group);
    const isExternal = Boolean(group.external);
    const openTitle = isExternal
      ? labels.openExternalItem(group.title)
      : labels.openItem(group.title);

    actions.push({
      id: `open-${group.key}`,
      kind: isExternal ? 'external' : 'navigate',
      title: openTitle,
      description: isExternal
        ? labels.openExternalItemDescription(group.title)
        : labels.openItemDescription(group.title),
      href: group.href,
      targetHref: group.href,
      icon: group.icon,
      productId: group.id,
      productTitle: group.title,
      path: group.path,
      aliases: ['open', 'go', 'navigate', ...aliases],
      external: group.external,
      newTab: group.newTab,
      priority: 40,
    });

    if (isCreatableProduct(group)) {
      actions.push({
        id: `create-${group.key}`,
        kind: 'panel',
        panel: getPanelForProduct(group),
        title: labels.createInProduct(group.title),
        description: labels.createInProductDescription(group.title),
        href: group.href,
        targetHref: getCreateTargetHref(group),
        icon: group.icon,
        productId: group.id,
        productTitle: group.title,
        path: group.path,
        aliases: ['add', 'create', 'new', 'quick add', ...aliases],
        priority: 100,
      });
    } else if (!isExternal && group.id !== 'dashboard') {
      actions.push({
        id: `manage-${group.key}`,
        kind: 'navigate',
        title: labels.manageProduct(group.title),
        description: labels.manageProductDescription(group.title),
        href: group.href,
        targetHref: group.href,
        icon: group.icon,
        productId: group.id,
        productTitle: group.title,
        path: group.path,
        aliases: ['manage', 'configure', 'settings', ...aliases],
        priority: 80,
      });
    }
  }

  return actions.sort((a, b) => b.priority - a.priority);
}
