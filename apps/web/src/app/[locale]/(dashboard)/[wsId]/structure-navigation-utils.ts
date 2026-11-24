import type { NavLink } from '@tuturuuu/ui/custom/navigation';

export function cleanNavigationSeparators(
  items: (NavLink | null | undefined)[]
): (NavLink | null)[] {
  const result: (NavLink | null)[] = [];

  for (const item of items) {
    if (item === undefined) continue;
    if (!item && (result.length === 0 || result.at(-1) === null)) continue;

    result.push(item);
  }

  while (result.at(-1) === null) {
    result.pop();
  }

  return result;
}

export function getNavigationChildCount(link: NavLink | null | undefined) {
  return link?.children?.filter(Boolean).length ?? 0;
}

export function hasMultipleNavigationChildren(
  link: NavLink | null | undefined
) {
  return getNavigationChildCount(link) > 1;
}

export function insertArchivedNavigationLink({
  archivedNavigationLink,
  children,
}: {
  archivedNavigationLink: NavLink;
  children: (NavLink | null)[];
}): (NavLink | null)[] {
  if (!children.some(Boolean)) return [archivedNavigationLink];

  return cleanNavigationSeparators([...children, null, archivedNavigationLink]);
}
