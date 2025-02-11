'use client';

import LogoTitle from '../../logo-title';
import WorkspaceSelect from '../../workspace-select';
import { Nav } from './nav';
import { NavLink } from '@/components/navigation';
import { PROD_MODE, ROOT_WORKSPACE_ID } from '@/constants/common';
import { cn } from '@/lib/utils';
import { Workspace } from '@tutur3u/types/primitives/Workspace';
import { WorkspaceUser } from '@tutur3u/types/primitives/WorkspaceUser';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@tutur3u/ui/components/ui/breadcrumb';
import { Button } from '@tutur3u/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tutur3u/ui/components/ui/dropdown-menu';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@tutur3u/ui/components/ui/resizable';
import { Separator } from '@tutur3u/ui/components/ui/separator';
import { TooltipProvider } from '@tutur3u/ui/components/ui/tooltip';
import { debounce } from 'lodash';
import { Menu, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, Suspense, useCallback, useEffect, useState } from 'react';

interface MailProps {
  wsId: string;
  workspace: Workspace | null;
  defaultLayout: number[] | undefined;
  defaultCollapsed?: boolean;
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
    .sort((a, b) => b.href.length - a.href.length)
    .filter(
      (link) =>
        pathname.startsWith(link.href) ||
        link.aliases?.some((alias) => pathname.startsWith(alias))
    )
    .sort((a, b) => b.href.length - a.href.length);

  const currentLink = matchedLinks?.[0];

  return (
    <>
      <nav
        id="navbar"
        className="fixed z-10 flex w-full flex-none items-center justify-between gap-2 border-b bg-background/70 px-4 py-2 backdrop-blur-lg md:hidden"
      >
        <div className="flex h-[52px] items-center gap-2">
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
          <div className="mx-2 h-4 w-[1px] flex-none rotate-[30deg] bg-foreground/20" />
          <div className="flex items-center gap-2 text-lg font-semibold break-all">
            {currentLink?.icon && (
              <div className="flex-none">{currentLink.icon}</div>
            )}
            <span className="line-clamp-1">{currentLink?.title}</span>
          </div>
        </div>
        <div className="flex h-[52px] items-center gap-2">
          {userPopover}
          <Button
            size="icon"
            variant="outline"
            className="h-auto w-auto flex-none rounded-lg p-2 md:hidden"
            onClick={() => setIsCollapsed((prev) => !prev)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </nav>

      <TooltipProvider delayDuration={0}>
        <ResizablePanelGroup
          direction="horizontal"
          onLayout={(sizes: number[]) => {
            const [sidebar, main] = sizes;
            if (typeof sidebar === 'number' && typeof main === 'number') {
              debouncedSaveSizes({ sidebar, main });
            }
          }}
          className={cn(
            'fixed h-screen max-h-screen items-stretch',
            isCollapsed ? 'z-0' : 'z-20'
          )}
        >
          <ResizablePanel
            defaultSize={defaultLayout[0]}
            collapsedSize={navCollapsedSize}
            collapsible={true}
            minSize={15}
            maxSize={40}
            onCollapse={() => {
              setIsCollapsed(true);
              debouncedSaveCollapsed(true);
            }}
            onResize={() => {
              setIsCollapsed(false);
              debouncedSaveCollapsed(false);
            }}
            className={cn(
              isCollapsed
                ? 'hidden min-w-[50px] md:flex'
                : 'absolute inset-0 z-40 flex bg-background/70 md:static md:bg-transparent',
              'flex-col justify-between overflow-hidden backdrop-blur-lg transition-all duration-300 ease-in-out'
            )}
          >
            <div className="scrollbar-none flex-shrink overflow-auto">
              <div className="py-2 md:p-0">
                <div
                  className={cn(
                    'flex h-[52px] items-center justify-center',
                    isCollapsed ? 'h-[52px]' : 'px-2'
                  )}
                >
                  <div
                    className={cn(
                      isCollapsed ? 'px-2' : 'px-2 md:px-0',
                      'flex w-full items-center gap-2'
                    )}
                  >
                    {isCollapsed || (
                      <Link
                        href="/"
                        className="flex flex-none items-center gap-2"
                      >
                        <Image
                          src="/media/logos/transparent.png"
                          className="h-8 w-8"
                          width={32}
                          height={32}
                          alt="logo"
                        />
                        <LogoTitle />
                      </Link>
                    )}

                    <Suspense
                      fallback={
                        <div className="h-10 w-32 animate-pulse rounded-lg bg-foreground/5" />
                      }
                    >
                      <WorkspaceSelect hideLeading={isCollapsed} />
                    </Suspense>
                    {isCollapsed || (
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-auto w-auto flex-none rounded-lg p-2 md:hidden"
                        onClick={() => setIsCollapsed((prev) => !prev)}
                      >
                        <X className="h-5 w-5" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
              <Separator />
              <Nav
                wsId={wsId}
                currentUser={user}
                isCollapsed={isCollapsed}
                links={links}
                onClick={() => window.innerWidth < 768 && setIsCollapsed(true)}
              />
            </div>
            <div className="flex-none border-t border-foreground/10 p-2">
              {isCollapsed ? userPopover : actions}
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle className="hidden md:flex" />
          <ResizablePanel defaultSize={defaultLayout[1]}>
            <main
              id="main-content"
              className="relative flex h-full min-h-screen flex-col overflow-y-auto p-4 pt-20 md:pt-4 lg:px-8 xl:px-16"
            >
              <Breadcrumb className="mb-4 hidden md:block">
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink
                      href={pathname === `/${wsId}` ? '#' : `/${wsId}`}
                    >
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
                        {filteredLinks.map((link, index) =>
                          link ? (
                            <Link
                              key={index}
                              href={link.href === pathname ? '#' : link.href}
                              className={cn(
                                link.disabled || link.href === pathname
                                  ? 'pointer-events-none'
                                  : ''
                              )}
                              passHref
                              replace
                            >
                              <DropdownMenuItem
                                className="flex items-center gap-2"
                                disabled={
                                  link.disabled || link.href === pathname
                                }
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
                      href={
                        currentLink?.href === pathname ? '#' : currentLink?.href
                      }
                      className="flex items-center gap-2"
                    >
                      {currentLink?.icon}
                      {currentLink?.title}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
              {children}
            </main>
          </ResizablePanel>
        </ResizablePanelGroup>
      </TooltipProvider>
    </>
  );
}
