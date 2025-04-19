'use client';

import { Nav } from './nav';
import { NavLink } from '@/components/navigation';
import { PROD_MODE, ROOT_WORKSPACE_ID } from '@/constants/common';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@radix-ui/react-dropdown-menu';
import { useQuery } from '@tanstack/react-query';
import { Workspace } from '@tuturuuu/types/primitives/Workspace';
import { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@tuturuuu/ui/breadcrumb';
import { LogoTitle } from '@tuturuuu/ui/custom/logo-title';
import { Structure as BaseStructure } from '@tuturuuu/ui/custom/structure';
import { WorkspaceSelect } from '@tuturuuu/ui/custom/workspace-select';
import { cn } from '@tuturuuu/utils/format';
import { debounce } from 'lodash';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, Suspense, useCallback, useEffect, useState } from 'react';

interface MailProps {
  wsId: string;
  workspace: Workspace | null;
  defaultLayout?: number[];
  defaultCollapsed: boolean;
  navCollapsedSize: number;
  user: WorkspaceUser | null;
  links: (NavLink | null)[];
  actions: ReactNode;
  userPopover: ReactNode;
  children: ReactNode;
}

export function Structure({
  wsId,
  workspace,
  defaultLayout = [20, 80],
  defaultCollapsed = false,
  navCollapsedSize,
  user,
  links,
  actions,
  userPopover,
  children,
}: MailProps) {
  const t = useTranslations();
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  // Add debounced function for saving sidebar sizes
  const debouncedSaveSizes = useCallback(
    debounce(async (sizes: { sidebar: number; main: number }) => {
      await fetch('/api/v1/infrastructure/sidebar/sizes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sizes),
      });
    }, 500),
    []
  );

  // Add debounced function for saving sidebar collapsed state
  const debouncedSaveCollapsed = useCallback(
    debounce(async (collapsed: boolean) => {
      await fetch('/api/v1/infrastructure/sidebar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ collapsed }),
      });
    }, 500),
    []
  );

  // Cleanup debounced functions on unmount
  useEffect(() => {
    return () => {
      debouncedSaveSizes.cancel();
      debouncedSaveCollapsed.cancel();
    };
  }, [debouncedSaveSizes, debouncedSaveCollapsed]);

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
        pathname.startsWith(link.href) ||
        link.aliases?.some((alias) => pathname.startsWith(alias))
    )
    .sort((a, b) => b.href.length - a.href.length);

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
          <div className="bg-foreground/5 h-10 w-32 animate-pulse rounded-lg" />
        }
      >
        <WorkspaceSelect
          t={t}
          hideLeading={isCollapsed}
          localUseQuery={useQuery}
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

  const header = (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href={pathname === `/${wsId}` ? '#' : `/${wsId}`}>
            {workspace?.name || t('common.unnamed-workspace')}
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1">
              <BreadcrumbEllipsis className="h-4 w-4" />
              <span className="sr-only">Toggle menu</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {links.map((link, index) =>
                link ? (
                  <Link
                    key={index}
                    href={link.href === pathname ? '#' : link.href}
                    className={cn(
                      link.disabled || link.href === pathname
                        ? 'pointer-events-none'
                        : ''
                    )}
                  >
                    <DropdownMenuItem
                      className="flex items-center gap-2"
                      disabled={link.disabled || link.href === pathname}
                    >
                      {link.icon}
                      {link.title}
                    </DropdownMenuItem>
                  </Link>
                ) : null
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink
            href={currentLink?.href === pathname ? '#' : currentLink?.href}
            className="flex items-center gap-2"
          >
            {currentLink?.icon}
            {currentLink?.title}
          </BreadcrumbLink>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );

  const mobileHeader = (
    <>
      <div className="flex flex-none items-center gap-2">
        <Link href="/" className="flex flex-none items-center gap-2">
          <Image
            src="/media/logos/transparent.png"
            className="h-8 w-8"
            width={32}
            height={32}
            alt="logo"
          />
        </Link>
      </div>
      <div className="bg-foreground/20 mx-2 h-4 w-[1px] flex-none rotate-[30deg]" />
      <div className="flex items-center gap-2 break-all text-lg font-semibold">
        {currentLink?.icon && (
          <div className="flex-none">{currentLink.icon}</div>
        )}
        <span className="line-clamp-1">{currentLink?.title}</span>
      </div>
    </>
  );

  return (
    <BaseStructure
      defaultLayout={defaultLayout}
      navCollapsedSize={navCollapsedSize}
      isCollapsed={isCollapsed}
      setIsCollapsed={setIsCollapsed}
      debouncedSaveSizes={debouncedSaveSizes}
      debouncedSaveCollapsed={debouncedSaveCollapsed}
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
