import type { NavLink } from '@tuturuuu/ui/custom/navigation';

export function matchesPath(
  pathname: string,
  target?: string,
  hasChildren?: boolean
) {
  if (!target) return false;
  if (hasChildren) {
    return pathname === target || pathname.startsWith(`${target}/`);
  }
  return pathname === target;
}

export function flattenSingleChildLinks(
  links: (NavLink | null)[]
): (NavLink | null)[] {
  return links.flatMap((link) =>
    link?.children && link.children.length === 1
      ? [link.children[0] as NavLink]
      : [link]
  );
}

function removeConsecutiveNulls(arr: (NavLink | null)[]): (NavLink | null)[] {
  const withoutConsecutive = arr.reduce<(NavLink | null)[]>(
    (acc, item, index) => {
      if (item === null && index > 0 && arr[index - 1] === null) {
        return acc;
      }
      acc.push(item);
      return acc;
    },
    []
  );

  while (withoutConsecutive.length > 0 && withoutConsecutive[0] === null) {
    withoutConsecutive.shift();
  }

  while (
    withoutConsecutive.length > 0 &&
    withoutConsecutive[withoutConsecutive.length - 1] === null
  ) {
    withoutConsecutive.pop();
  }

  return withoutConsecutive;
}

export function getFilteredLinks(
  linksToFilter: (NavLink | null)[] | undefined
): (NavLink | null)[] {
  const filtered: (NavLink | null)[] = (linksToFilter || []).flatMap((link) => {
    if (!link) return [null];
    if (link.disabled) return [];

    if (link.children && link.children.length > 1) {
      const filteredChildren = getFilteredLinks(link.children);
      const hasContent = filteredChildren.some(
        (child: NavLink | null) => child !== null
      );
      return hasContent ? [{ ...link, children: filteredChildren }] : [];
    }

    if (link.children && link.children.length === 1) {
      return getFilteredLinks([link.children[0] as NavLink]);
    }

    return [link];
  });

  return removeConsecutiveNulls(filtered);
}
