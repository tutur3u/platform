'use client';

import { listCurrentUserAiChats } from '@tuturuuu/internal-api';
import { SidebarStructure } from '@tuturuuu/satellite/sidebar-structure';
import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { TuturuuLogo } from '@tuturuuu/ui/custom/tuturuuu-logo';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { TTR_URL } from '@/constants/common';
import { RewiseSidebarChats } from './rewise-sidebar-chats';
import { WorkspaceSelect } from './workspace-select';

interface StructureProps {
  actions: ReactNode;
  children: ReactNode;
  defaultCollapsed: boolean;
  links: (NavLink | null)[];
  personalOrWsId: string;
  userPopover: ReactNode;
  workspace: { tier?: string | null } | null;
  wsId: string;
}

const rewiseLogoTitleClassName = cn(
  'bg-linear-to-r from-dynamic-light-red via-dynamic-light-pink to-dynamic-light-blue bg-clip-text py-1 text-transparent',
  'font-bold text-2xl'
);

export function Structure({
  actions,
  children,
  defaultCollapsed = false,
  links,
  personalOrWsId,
  userPopover,
  workspace,
  wsId,
}: StructureProps) {
  const brandHref = `/${personalOrWsId}/new`;

  return (
    <SidebarStructure
      actions={actions}
      brand={
        <>
          <TuturuuLogo alt="" className="h-6 w-6" height={32} width={32} />
          <LogoTitle text="Rewise" className={rewiseLogoTitleClassName} />
        </>
      }
      brandHref={brandHref}
      defaultCollapsed={defaultCollapsed}
      links={links}
      mobileBrand={
        <Link className="flex flex-none items-center gap-2" href={brandHref}>
          <TuturuuLogo alt="" className="h-8 w-8" height={32} width={32} />
        </Link>
      }
      sidebarContentAfter={({ closeOnMobile, isCollapsed }) => (
        <RewiseSidebarChats
          closeOnMobile={closeOnMobile}
          isCollapsed={isCollapsed}
          listChats={listCurrentUserAiChats}
          personalOrWsId={personalOrWsId}
        />
      )}
      upgradeExternal
      upgradeHref={`${TTR_URL}/${wsId}/billing`}
      userPopover={userPopover}
      workspace={workspace}
      workspaceSelect={({ isCollapsed }) => (
        <WorkspaceSelect hideLeading={isCollapsed} wsId={wsId} />
      )}
      wsId={wsId}
    >
      {children}
    </SidebarStructure>
  );
}
