'use client';

import { Server } from '@tuturuuu/icons';
import { SidebarStructure } from '@tuturuuu/satellite/sidebar-structure';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { TuturuuLogo } from '@tuturuuu/ui/custom/tuturuuu-logo';
import type { ReactNode } from 'react';
import { TTR_URL, WEB_APP_URL } from '@/constants/common';

interface StructureProps {
  actions: ReactNode;
  children: ReactNode;
  defaultCollapsed: boolean;
  links: (NavLink | null)[];
  userPopover: ReactNode;
  workspace: { tier?: string | null } | null;
  wsId: string;
}

function InfraMark({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-dynamic bg-foreground/5">
        <Server className="h-4 w-4" />
      </span>
      {collapsed ? null : (
        <span className="min-w-0 flex-1 truncate font-semibold text-base">
          Infra
        </span>
      )}
    </span>
  );
}

function TuturuuuHomeLink() {
  return (
    <a
      aria-label="Tuturuuu"
      className="flex h-9 w-9 flex-none items-center justify-center rounded-md border border-dynamic bg-foreground/5 transition hover:bg-foreground/10"
      href={WEB_APP_URL}
    >
      <TuturuuLogo alt="" className="h-6 w-6" height={24} width={24} />
    </a>
  );
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
      brand={<InfraMark />}
      brandHref={`/${wsId}`}
      childContainerClassName="mx-auto flex w-full max-w-7xl flex-col gap-8 md:px-2"
      collapsedBrand={<InfraMark collapsed />}
      defaultCollapsed={defaultCollapsed}
      links={links}
      mobileBrand={<InfraMark />}
      sidebarExpandedWidth="18.5rem"
      sidebarHeaderClassName="border-foreground/10 border-b"
      upgradeExternal
      upgradeHref={`${TTR_URL}/${wsId}/billing`}
      userPopover={userPopover}
      workspace={workspace}
      workspaceSelect={() => <TuturuuuHomeLink />}
      wsId={wsId}
    >
      {children}
    </SidebarStructure>
  );
}
