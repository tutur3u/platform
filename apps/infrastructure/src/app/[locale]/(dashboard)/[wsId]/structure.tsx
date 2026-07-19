'use client';

import { FixedAppBrand } from '@tuturuuu/satellite/fixed-app-brand';
import { SidebarStructure } from '@tuturuuu/satellite/sidebar-structure';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { TuturuuLogo } from '@tuturuuu/ui/custom/tuturuuu-logo';
import type { ReactNode } from 'react';
import { TTR_URL } from '@/constants/common';

interface StructureProps {
  actions: ReactNode;
  children: ReactNode;
  defaultCollapsed: boolean;
  links: (NavLink | null)[];
  userPopover: ReactNode;
  workspace: { tier?: string | null } | null;
  wsId: string;
}

export function Structure({
  actions,
  children,
  defaultCollapsed = false,
  links,
  userPopover,
  workspace,
  wsId,
}: StructureProps) {
  return (
    <SidebarStructure
      actions={actions}
      brand={
        <FixedAppBrand
          appHref={`/${wsId}`}
          appName="Infra"
          centralHref={TTR_URL}
        />
      }
      brandHref={TTR_URL}
      childContainerClassName="mx-auto flex w-full max-w-7xl flex-col gap-8 md:px-2"
      collapsedBrand={
        <TuturuuLogo alt="" className="size-8" height={32} width={32} />
      }
      defaultCollapsed={defaultCollapsed}
      links={links}
      linkBrand={false}
      mobileBrand={
        <FixedAppBrand
          appHref={`/${wsId}`}
          appName="Infra"
          centralHref={TTR_URL}
        />
      }
      sidebarExpandedWidth="18.5rem"
      sidebarHeaderClassName="border-foreground/10 border-b"
      upgradeExternal
      upgradeHref={`${TTR_URL}/${wsId}/billing`}
      userPopover={userPopover}
      workspace={workspace}
      wsId={wsId}
    >
      {children}
    </SidebarStructure>
  );
}
