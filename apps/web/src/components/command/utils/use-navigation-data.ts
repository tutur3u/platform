import * as React from 'react';
import type { NavLink } from '@/components/navigation';

export interface FlatNavItem {
  title: string;
  href: string;
  icon?: React.ReactNode;
  category?: string; // Parent category name
  aliases?: string[];
  experimental?: 'alpha' | 'beta' | 'new';
  path: string[]; // Full path for breadcrumbs, e.g., ["Tasks", "My Tasks"]
}

/**
 * Flatten nested navigation structure into searchable items
 */
function flattenNavigation(
  navLinks: (NavLink | null)[],
  parentPath: string[] = []
): FlatNavItem[] {
  const flattened: FlatNavItem[] = [];

  for (const link of navLinks) {
    // Skip null entries (separators)
    if (!link) continue;

    // Skip disabled items
    if (link.disabled || link.tempDisabled) continue;

    // Skip items without href
    if (!link.href) {
      // But process children if they exist
      if (link.children) {
        const currentPath = [...parentPath, link.title];
        flattened.push(...flattenNavigation(link.children, currentPath));
      }
      continue;
    }

    // Add current item
    const currentPath =
      parentPath.length > 0 ? [...parentPath, link.title] : [link.title];

    flattened.push({
      title: link.title,
      href: link.href,
      icon: link.icon,
      category: parentPath[parentPath.length - 1], // Immediate parent
      aliases: link.aliases,
      experimental: link.experimental,
      path: currentPath,
    });

    // Process children if they exist
    if (link.children) {
      flattened.push(
        ...flattenNavigation(link.children, currentPath.slice(0, -1))
      );
    }
  }

  return flattened;
}

/**
 * Hook to prepare and cache flattened navigation data for command palette
 */
export function useNavigationData(navLinks: (NavLink | null)[]) {
  const flattenedNav = React.useMemo(() => {
    return flattenNavigation(navLinks);
  }, [navLinks]);

  return flattenedNav;
}
