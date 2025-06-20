'use client';

import { Nav } from './nav';
import { NavLink } from '@/components/navigation';
import { PROD_MODE } from '@/constants/common';
import { useQuery } from '@tanstack/react-query';
import { Workspace } from '@tuturuuu/types/db';
import { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import { Structure as BaseStructure } from '@tuturuuu/ui/custom/structure';
import { WorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, Suspense, useState } from 'react';

interface MailProps {
  wsId: string;
  workspace: Workspace | null;
  defaultCollapsed?: boolean;
  user: WorkspaceUser | null;
  links: (NavLink | null)[];
  actions: ReactNode;
  userPopover: ReactNode;
  children: ReactNode;
}

export function Structure({
  wsId,
  defaultCollapsed = false,
  user,
  links,
  actions,
  userPopover,
  children,
}: MailProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const isRootWorkspace = wsId === ROOT_WORKSPACE_ID;

  const filteredLinks = links.filter((link) => {
    // If the link is disabled, don't render it
    if (!link || link?.disabled) return null;

    // If the link is disabled on production, don't render it
    if (link?.disableOnProduction && PROD_MODE) return null;

    // If the link requires root membership, check if user email ends with @tuturuuu.com
    if (link?.requireRootMember && !user?.email?.endsWith('@tuturuuu.com'))
      return null;

    // If the link requires the root workspace, check if the current workspace is the root workspace
    if (link?.requireRootWorkspace && !isRootWorkspace) return null;

    // If the link is only allowed for certain roles, check if the current role is allowed
    if (link?.allowedRoles && link.allowedRoles.length > 0) return null;

    return link;
  });

  const matchedLinks = filteredLinks
    .filter((link) => link !== null)
    .filter(
      (link) =>
        link.href &&
        (pathname.startsWith(link.href) ||
          link.aliases?.some((alias) => pathname.startsWith(alias)))
    )
    .sort((a, b) => (b.href?.length || 0) - (a.href?.length || 0));

  const currentLink = matchedLinks?.[0];

  const sidebarHeader = (
    <>
      {isCollapsed || (
        <Link href="/" className="flex flex-none items-center gap-2">
          <div className="flex-none">
            <Image
              src="/media/logos/transparent.png"
              className="h-8 w-8"
              width={32}
              height={32}
              alt="logo"
            />
          </div>
          <LogoTitle />
        </Link>
      )}

      <Suspense
        fallback={
          <div className="h-10 w-32 animate-pulse rounded-lg bg-foreground/5" />
        }
      >
        <WorkspaceSelect
          t={t}
          hideLeading={isCollapsed}
          localUseQuery={useQuery}
          customRedirectSuffix={`home`}
        />
      </Suspense>
    </>
  );

  const sidebarContent = (
    <Nav
      wsId={wsId}
      currentUser={user}
      isCollapsed={isCollapsed}
      links={links}
      onClick={() => window.innerWidth < 768 && setIsCollapsed(true)}
    />
  );

  const header = null;

  const mobileHeader = (
    <>
      <div className="flex flex-none items-center gap-2">
        <Link href="/" className="flex flex-none items-center gap-2">
          <Image
            src="/media/logos/nova-transparent.png"
            className="h-8 w-8"
            width={32}
            height={32}
            alt="logo"
          />
        </Link>
      </div>
      <div className="mx-2 h-4 w-px flex-none rotate-30 bg-foreground/20" />
      <div className="flex items-center gap-2 text-lg font-semibold break-all">
        {currentLink?.icon && (
          <div className="flex-none">{currentLink.icon}</div>
        )}
        <span className="line-clamp-1">{currentLink?.title}</span>
      </div>
    </>
  );

  return (
    <BaseStructure
      isCollapsed={isCollapsed}
      setIsCollapsed={setIsCollapsed}
      header={header}
      mobileHeader={mobileHeader}
      sidebarHeader={sidebarHeader}
      sidebarContent={sidebarContent}
      actions={actions}
      userPopover={userPopover}
      children={children}
    />
  );
}
