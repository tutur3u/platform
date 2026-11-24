import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { MORE_TOOLS_NAVIGATION_ID } from './sidebar-navigation-preferences';

/**
 * The sidebar has no More tools section. The tools container's children
 * render as dedicated items below the pinned ones, grouped by section label,
 * and every app also stays reachable from the Apps picker. Separators are
 * collapsed so no two dividers touch and none leads or trails the list.
 */
export function flattenToolsSection(
  links: (NavLink | null)[]
): (NavLink | null)[] {
  const flat = links.flatMap((link) =>
    link?.id === MORE_TOOLS_NAVIGATION_ID
      ? [null, ...(link.children ?? []), null]
      : [link]
  );
  const result: (NavLink | null)[] = [];
  for (const link of flat) {
    if (link === null && (result.length === 0 || result.at(-1) === null))
      continue;
    result.push(link);
  }
  while (result.length > 0 && result.at(-1) === null) result.pop();
  return result;
}
