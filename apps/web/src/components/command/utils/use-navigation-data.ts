import * as React from 'react';
import type { NavLink } from '@/components/navigation';

export interface FlatNavItem {
  id?: string;
  title: string;
  href: string;
  icon?: React.ReactNode;
  category?: string; // Parent category name
  aliases?: string[];
  experimental?: 'alpha' | 'beta' | 'new';
  external?: boolean;
  newTab?: boolean;
  productId?: string;
  productTitle: string;
  productHref?: string;
  path: string[]; // Full path for breadcrumbs, e.g., ["Tasks", "My Tasks"]
}

interface NavigationProductContext {
  id?: string;
  title?: string;
  href?: string;
}

/**
 * Flatten nested navigation structure into searchable items
 */
function flattenNavigation(
  navLinks: (NavLink | null)[],
  parentPath: string[] = [],
  productContext: NavigationProductContext = {}
): FlatNavItem[] {
  const flattened: FlatNavItem[] = [];

  for (const link of navLinks) {
    // Skip null entries (separators)
    if (!link) continue;

    // Skip disabled items
    if (link.disabled || link.tempDisabled) continue;

    const currentPath =
      parentPath.length > 0 ? [...parentPath, link.title] : [link.title];

    const isProductGroup =
      !productContext.title &&
      Boolean(link.id) &&
      link.id !== 'more_tools' &&
      link.id !== 'google_workspace';

    const nextProductContext: NavigationProductContext =
      !productContext.title && (link.href || isProductGroup)
        ? {
            id: link.id,
            title: link.title,
            href: link.href,
          }
        : productContext;

    // Skip items without href
    if (!link.href) {
      // But process children if they exist
      if (link.children) {
        flattened.push(
          ...flattenNavigation(link.children, currentPath, nextProductContext)
        );
      }
      continue;
    }

    // Add current item
    flattened.push({
      id: link.id,
      title: link.title,
      href: link.href,
      icon: link.icon,
      category: parentPath[parentPath.length - 1], // Immediate parent
      aliases: link.aliases,
      experimental: link.experimental,
      external: link.external,
      newTab: link.newTab,
      productId: nextProductContext.id,
      productTitle: nextProductContext.title ?? link.title,
      productHref: nextProductContext.href ?? link.href,
      path: currentPath,
    });

    // Process children if they exist
    if (link.children) {
      flattened.push(
        ...flattenNavigation(link.children, currentPath, nextProductContext)
      );
    }
  }

  return flattened;
}

export { flattenNavigation };

/**
 * Hook to prepare and cache flattened navigation data for command palette
 */
export function useNavigationData(navLinks: (NavLink | null)[]) {
  const flattenedNav = React.useMemo(() => {
    return flattenNavigation(navLinks);
  }, [navLinks]);

  return flattenedNav;
}
