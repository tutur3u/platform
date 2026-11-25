import type { NavLink } from '@tuturuuu/ui/custom/navigation';

export function getNavigationChildCount(link: NavLink | null | undefined) {
  return link?.children?.filter(Boolean).length ?? 0;
}

export function hasMultipleNavigationChildren(
  link: NavLink | null | undefined
) {
  return getNavigationChildCount(link) > 1;
}
