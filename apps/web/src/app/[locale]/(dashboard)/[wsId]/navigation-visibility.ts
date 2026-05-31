import type { WorkspaceProductTier } from '@tuturuuu/types';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { isValidTuturuuuEmail } from '@tuturuuu/utils/email/client';
import { meetsAnyTierRequirement } from '@/lib/feature-tiers';

export interface DashboardNavigationVisibilityOptions {
  currentWsId: string;
  flattenSingleChild?: boolean;
  prodMode: boolean;
  userEmail?: string | null;
  workspaceTier?: WorkspaceProductTier | null;
}

function removeConsecutiveNulls(
  items: (NavLink | null | undefined)[]
): (NavLink | null)[] {
  const withoutUndefined = items.filter(
    (item): item is NavLink | null => item !== undefined
  );
  const withoutConsecutive: (NavLink | null)[] = [];

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

export function filterDashboardNavigationLinks(
  linksToFilter: (NavLink | null)[] | undefined,
  options: DashboardNavigationVisibilityOptions
): (NavLink | null)[] {
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
        }).filter((archivedItem): archivedItem is NavLink =>
          Boolean(archivedItem)
        )
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
            },
          ];
        }

        return isTuturuuuEmployee ? [linkWithArchivedItems] : [];
      }

      return [
        {
          ...linkWithArchivedItems,
          requiredWorkspaceTier: undefined,
        },
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
          [linkWithArchivedItems.children[0] as NavLink],
          options
        );
      }

      return [
        {
          ...linkWithArchivedItems,
          children: filteredChildren,
        },
      ];
    }

    return [linkWithArchivedItems];
  });

  return removeConsecutiveNulls(filtered);
}
