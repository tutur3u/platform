'use client';

import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { SidebarFooterActions } from '@tuturuuu/ui/custom/sidebar-footer-actions';
import { Structure as BaseStructure } from '@tuturuuu/ui/custom/structure';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { TTR_URL } from '@/constants/common';
import { getStructurePanels } from './structure-panels';
import { useStructureNavigation } from './use-structure-navigation';
import { useStructureShellState } from './use-structure-shell-state';

interface StructureProps {
  wsId: string;
  workspace: { tier?: string | null } | null;
  defaultCollapsed: boolean;
  links: (NavLink | null)[];
  actions: ReactNode;
  userPopover: ReactNode;
  children: ReactNode;
}

export function Structure({
  wsId,
  workspace,
  defaultCollapsed = false,
  links,
  actions,
  userPopover,
  children,
}: StructureProps) {
  const t = useTranslations();
  const shell = useStructureShellState(defaultCollapsed);
  const navigation = useStructureNavigation(links, t('common.back'));
  const { mobileHeader, sidebarContent, sidebarHeader } = getStructurePanels({
    backButton: navigation.backButton,
    currentLink: navigation.currentLink,
    currentTitle: navigation.currentTitle,
    filteredCurrentLinks: navigation.filteredCurrentLinks,
    handleNavChange: navigation.handleNavChange,
    isCollapsed: shell.isCollapsed,
    navState: navigation.navState,
    setIsCollapsed: shell.setIsCollapsed,
    wsId,
  });

  if (!shell.initialized) return null;

  return (
    <BaseStructure
      isCollapsed={shell.isCollapsed}
      setIsCollapsed={shell.handleToggle}
      header={null}
      mobileHeader={mobileHeader}
      sidebarHeader={sidebarHeader}
      sidebarContent={sidebarContent}
      actions={actions}
      userPopover={userPopover}
      feedbackButton={
        <SidebarFooterActions
          wsId={wsId}
          isCollapsed={shell.isCollapsed}
          showUpgrade={!workspace?.tier || workspace.tier === 'FREE'}
          upgradeHref={`${TTR_URL}/${wsId}/billing`}
          upgradeExternal
        />
      }
      onMouseEnter={shell.onMouseEnter}
      onMouseLeave={shell.onMouseLeave}
      hideSizeToggle={shell.behavior === 'hover'}
      overlayOnExpand={shell.behavior === 'hover'}
    >
      {children}
    </BaseStructure>
  );
}
