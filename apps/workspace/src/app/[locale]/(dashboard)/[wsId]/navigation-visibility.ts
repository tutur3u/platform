import type { WorkspaceProductTier } from '@tuturuuu/types';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import { meetsAnyTierRequirement } from '@/lib/feature-tiers';

type DashboardNavigationVisibilityLink = Omit<
  NavLink,
  'children' | 'icon' | 'preferenceArchivedItems'
> & {
  children?: (DashboardNavigationVisibilityLink | null)[];
  icon?: unknown;
  preferenceArchivedItems?: DashboardNavigationVisibilityLink[];
};

export interface DashboardNavigationVisibilityOptions {
  currentWsId: string;
  flattenSingleChild?: boolean;
  prodMode: boolean;
  userEmail?: string | null;
  workspaceTier?: WorkspaceProductTier | null;
}

function removeConsecutiveNulls<T extends DashboardNavigationVisibilityLink>(
  items: (T | null | undefined)[]
): (T | null)[] {
  const withoutUndefined = items.filter(
    (item): item is T | null => item !== undefined
  );
  const withoutConsecutive: (T | null)[] = [];

  for (const item of withoutUndefined) {
    if (item === null && withoutConsecutive.at(-1) === null) continue;
    withoutConsecutive.push(item);
  }

  while (withoutConsecutive.at(0) === null) {
    withoutConsecutive.shift();
  }

  while (withoutConsecutive.at(-1) === null) {
    withoutConsecutive.pop();
  }

  return withoutConsecutive;
}

export function filterDashboardNavigationLinks<
  T extends DashboardNavigationVisibilityLink = NavLink,
>(
  linksToFilter: (T | null)[] | undefined,
  options: DashboardNavigationVisibilityOptions
): (T | null)[] {
  const isRootWorkspace = options.currentWsId === ROOT_WORKSPACE_ID;
  const isTuturuuuEmployee = isValidTuturuuuEmail(options.userEmail);
  const currentTier = options.workspaceTier || 'FREE';
  const filtered = (linksToFilter || []).flatMap((link) => {
    if (!link) return [null];

    if (link.disabled) return [];
    if (link.disableOnProduction && options.prodMode) return [];
    if (link.requireRootMember && !isTuturuuuEmployee) return [];
    if (link.requireRootWorkspace && !isRootWorkspace) return [];

    const archivedItems = link.preferenceArchivedItems
      ? filterDashboardNavigationLinks(link.preferenceArchivedItems, {
          ...options,
          flattenSingleChild: false,
        }).filter((archivedItem): archivedItem is T => Boolean(archivedItem))
      : undefined;

    if (link.preferenceArchivedItems && archivedItems?.length === 0) {
      return [];
    }

    const linkWithArchivedItems = archivedItems
      ? { ...link, preferenceArchivedItems: archivedItems }
      : link;

    if (linkWithArchivedItems.requiredWorkspaceTier) {
      const meetsTier = meetsAnyTierRequirement(
        currentTier,
        linkWithArchivedItems.requiredWorkspaceTier.requiredTier
      );

      if (!meetsTier) {
        if (linkWithArchivedItems.requiredWorkspaceTier.alwaysShow) {
          return [
            {
              ...linkWithArchivedItems,
              tempDisabled: !isTuturuuuEmployee,
            } as T,
          ];
        }

        return isTuturuuuEmployee ? [linkWithArchivedItems] : [];
      }

      return [
        {
          ...linkWithArchivedItems,
          requiredWorkspaceTier: undefined,
        } as T,
      ];
    }

    if (linkWithArchivedItems.children?.length) {
      const filteredChildren = filterDashboardNavigationLinks(
        linkWithArchivedItems.children,
        options
      );
      const hasContent = filteredChildren.some((child) => child !== null);

      if (!hasContent) return [];

      if (
        options.flattenSingleChild &&
        linkWithArchivedItems.children.length === 1
      ) {
        return filterDashboardNavigationLinks(
          [linkWithArchivedItems.children[0] as T],
          options
        );
      }

      return [
        {
          ...linkWithArchivedItems,
          children: filteredChildren,
        } as T,
      ];
    }

    return [linkWithArchivedItems as T];
  });

  return removeConsecutiveNulls(filtered as (T | null | undefined)[]);
}
